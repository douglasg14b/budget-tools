using System.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.ML;
using Serilog;
using YnabCategoryAi.Configuration;
using YnabCategoryAi.Data;
using YnabCategoryAi.ML;
using YnabCategoryAi.ML.Llm;
using YnabCategoryAi.ML.Travel;

namespace YnabCategoryAi;

/// <summary>
/// Warm scoring state: training data, lookup indexes, ML models, and periodic history
/// loaded once and reused across predict requests.
/// </summary>
public sealed class ScoringSession : IAsyncDisposable
{
  private readonly BudgetToolsContext _db;
  private readonly CategorizationPipeline _pipeline;
  private readonly MlSettings _mlSettings;
  private TrainingTransaction[] _trainingData;
  private readonly SemaphoreSlim _predictLock = new(1, 1);
  private bool _disposed;

  private ScoringSession(
    BudgetToolsContext db,
    CategorizationPipeline pipeline,
    MlSettings mlSettings,
    TrainingTransaction[] trainingData)
  {
    _db = db;
    _pipeline = pipeline;
    _mlSettings = mlSettings;
    _trainingData = trainingData;
  }

  public string ModelSignature { get; private set; } = string.Empty;

  public static async Task<ScoringSession> CreateAsync(
    IConfiguration config,
    bool forceRetrain = false,
    TextWriter? diagnostics = null)
  {
    TextWriter output = diagnostics ?? Console.Out;

    MlSettings mlSettings = config.GetSection("ML").Get<MlSettings>() ?? new MlSettings();
    ClassificationExclusionSettings exclusionSettings =
      config.GetSection("ClassificationExclusions").Get<ClassificationExclusionSettings>()
      ?? new ClassificationExclusionSettings();
    LlmSettings llmSettings = config.GetSection("Llm").Get<LlmSettings>() ?? new LlmSettings();
    if (string.IsNullOrWhiteSpace(llmSettings.ApiKey))
    {
      llmSettings.ApiKey = config["OPENAI_API_KEY"]
        ?? Environment.GetEnvironmentVariable("OPENAI_API_KEY")
        ?? string.Empty;
    }

    string connectionString = PostgresConnectionString.Resolve(
      config["DB_CONNECTION_STRING"],
      config.GetConnectionString("BudgetTools"));

    var dbOptions = new DbContextOptionsBuilder<BudgetToolsContext>()
      .UseNpgsql(connectionString)
      .UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking)
      .Options;

    var db = new BudgetToolsContext(dbOptions);

    CategoryCatalog catalog = Time(output, "load category catalog", () =>
      CategoryCatalog.Load(db, mlSettings.MinCategoryTrainingExamples));

    var mlContext = new MLContext(seed: 0);
    var payeeModel = new PayeeMappingModel(mlContext, mlSettings);
    var groupModel = new GroupClassificationModel(mlContext, mlSettings);
    var categoryModel = new CategoryClassificationModel(mlContext, mlSettings);
    var exclusionMatcher = new ClassificationExclusionMatcher(exclusionSettings);
    ILlmCategorizationService llmService = llmSettings.HasApiKey
      ? new OpenAiCategorizationService(llmSettings)
      : new NullLlmCategorizationService();

    var pipeline = new CategorizationPipeline(
      mlSettings,
      catalog,
      exclusionMatcher,
      payeeModel,
      groupModel,
      categoryModel,
      llmService);

    TrainingTransaction[] trainingData = Time(
      output,
      "load training transactions",
      () => TransactionQueries.GetTrainingTransactions(db));
    if (trainingData.Length == 0)
    {
      await db.DisposeAsync();
      throw new InvalidOperationException(
        "No accepted, categorized transactions found in the database.");
    }

    output.WriteLine($"Loaded {trainingData.Length} training transactions from database.");

    var session = new ScoringSession(db, pipeline, mlSettings, trainingData);
    await session.WarmAsync(forceRetrain, output);
    return session;
  }

  public async Task<PredictJsonPayload> PredictAsync(
    IReadOnlyList<string> transactionIds,
    bool useLlm,
    TextWriter? diagnostics = null)
  {
    ObjectDisposedException.ThrowIf(_disposed, this);
    if (transactionIds.Count == 0)
    {
      throw new ArgumentException("transactionIds must not be empty", nameof(transactionIds));
    }

    TextWriter output = diagnostics ?? TextWriter.Null;
    await _predictLock.WaitAsync();
    try
    {
      ConfigureTravelBias(_pipeline);

      PendingTransaction[] pending = Time(
        output,
        "load pending transactions",
        () => TransactionQueries.GetPendingTransactions(_db, transactionIds));
      output.WriteLine($"[timing] pending count: {pending.Length}");

      IReadOnlyList<CategorizationProposal> proposals = await TimeAsync(
        output,
        "score pending transactions",
        () => _pipeline.PredictPendingDetailedAsync(pending, useLlm));

      return new PredictJsonPayload
      {
        Summary = _pipeline.SummarizeQueue(proposals),
        Proposals = proposals,
      };
    }
    finally
    {
      _predictLock.Release();
    }
  }

  public async Task ReloadAsync(bool forceRetrain = false, TextWriter? diagnostics = null)
  {
    ObjectDisposedException.ThrowIf(_disposed, this);
    TextWriter output = diagnostics ?? Console.Out;

    await _predictLock.WaitAsync();
    try
    {
      TrainingTransaction[] trainingData = Time(
        output,
        "reload training transactions",
        () => TransactionQueries.GetTrainingTransactions(_db));
      if (trainingData.Length == 0)
      {
        throw new InvalidOperationException(
          "No accepted, categorized transactions found in the database.");
      }

      _trainingData = trainingData;
      await WarmAsync(forceRetrain, output);
    }
    finally
    {
      _predictLock.Release();
    }
  }

  public async ValueTask DisposeAsync()
  {
    if (_disposed)
    {
      return;
    }

    _disposed = true;
    _predictLock.Dispose();
    await _db.DisposeAsync();
  }

  private async Task WarmAsync(bool forceRetrain, TextWriter output)
  {
    Time(output, "rebuild lookups + load models", () =>
    {
      _pipeline.Train(_trainingData, forceRetrain);
      return 0;
    });

    PeriodicHistoryTransaction[] history = Time(
      output,
      "load periodic history",
      () => TransactionQueries.GetPeriodicHistory(_db));
    _pipeline.TrainPeriodic(history);
    output.WriteLine(
      $"[timing] periodic series index: {_pipeline.PeriodicIndex.LastTrainElapsed.TotalMilliseconds:F1}ms " +
      $"({_pipeline.PeriodicIndex.SeriesCount} series from {history.Length} history rows)");

    ConfigureTravelBias(_pipeline);
    ModelSignature = YnabCategoryAi.ModelSignature.Compute(_mlSettings);
    await Task.CompletedTask;
  }

  private static void ConfigureTravelBias(CategorizationPipeline pipeline)
  {
    (bool enabled, IReadOnlyList<TravelWindowRecord> windows) =
      TravelSqliteStore.Load(Environment.GetEnvironmentVariable("SQLITE_DB_PATH"));
    pipeline.ConfigureTravelBias(enabled, windows);
  }

  private static T Time<T>(TextWriter output, string label, Func<T> action)
  {
    Stopwatch stopwatch = Stopwatch.StartNew();
    T result = action();
    output.WriteLine($"[timing] {label}: {stopwatch.Elapsed.TotalSeconds:F1}s");
    return result;
  }

  private static async Task<T> TimeAsync<T>(TextWriter output, string label, Func<Task<T>> action)
  {
    Stopwatch stopwatch = Stopwatch.StartNew();
    T result = await action();
    output.WriteLine($"[timing] {label}: {stopwatch.Elapsed.TotalSeconds:F1}s");
    return result;
  }
}

public sealed class PredictJsonPayload
{
  public required CategorizationProposalQueueSummary Summary { get; init; }
  public required IReadOnlyList<CategorizationProposal> Proposals { get; init; }
}
