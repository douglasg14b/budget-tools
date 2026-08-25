using System.Diagnostics;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using CsvHelper;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.ML;
using Serilog;
using YnabCategoryAi.Configuration;
using YnabCategoryAi.Data;
using YnabCategoryAi.Data.Entities;
using YnabCategoryAi.ML;
using YnabCategoryAi.ML.Llm;
using YnabCategoryAi.ML.Travel;

namespace YnabCategoryAi;

public static class PipelineRunner
{
    public static async Task<int> RunAsync(string[] args)
    {
        string mode = args.Length > 0 ? args[0].ToLowerInvariant() : "run";
        SessionLog.Start(jsonStdout: mode == "predict-json");
        try
        {
            return await RunLoggedAsync(args, mode);
        }
        catch (Exception exception)
        {
            Log.Fatal(exception, "Unhandled exception");
            return 1;
        }
        finally
        {
            await SessionLog.ShutdownAsync();
        }
    }

    private static async Task<int> RunLoggedAsync(string[] args, string mode)
    {
        IConfiguration config = new ConfigurationBuilder()
            .SetBasePath(Directory.GetCurrentDirectory())
            .AddJsonFile("appsettings.json", optional: true)
            .AddJsonFile("appsettings.Local.json", optional: true)
            .AddEnvironmentVariables()
            .Build();

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

        await using var db = new BudgetToolsContext(dbOptions);

        TextWriter diagnostics = mode == "predict-json" ? Console.Error : Console.Out;
        bool forceRetrain = args.Contains("--force", StringComparer.OrdinalIgnoreCase);
        bool useLlm = args.Contains("--llm", StringComparer.OrdinalIgnoreCase) || llmSettings.Enabled;

        CategoryCatalog catalog = Time(
            diagnostics,
            "load category catalog",
            () => CategoryCatalog.Load(db, mlSettings.MinCategoryTrainingExamples));

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

        TrainingTransaction[] allTraining = Time(
            diagnostics,
            "load training transactions",
            () => TransactionQueries.GetTrainingTransactions(db));
        if (allTraining.Length == 0)
        {
            diagnostics.WriteLine("No accepted, categorized transactions found in the database.");
            return 1;
        }

        diagnostics.WriteLine($"Loaded {allTraining.Length} training transactions from database.");
        PrintCatalogSummary(catalog, diagnostics);

        (TrainingTransaction[] trainSet, TrainingTransaction[] evalSet) = SplitByDate(
            allTraining,
            mlSettings.ValidationHoldoutFraction);

        return mode switch
        {
            "export" => ExportTrainingCsv(allTraining, mlSettings),
            "train" => Train(pipeline, allTraining, forceRetrain, diagnostics),
            "evaluate" => Evaluate(pipeline, trainSet, evalSet, categoryModel, mlSettings),
            "evaluate-llm" => await EvaluateLlmAsync(pipeline, trainSet, evalSet, llmSettings, mlSettings),
            "diagnose" => Diagnose(pipeline, trainSet, evalSet, mlSettings),
            "analyze-gap" => AnalyzeGap(pipeline, trainSet, evalSet, catalog, mlSettings),
            "predict" => await PredictAfterTrainAsync(pipeline, allTraining, db, mlSettings, useLlm, forceRetrain),
            "predict-json" => await PredictJsonAsync(
                pipeline, allTraining, db, mlSettings, useLlm, forceRetrain, diagnostics, args),
            "feedback-stats" => await FeedbackStatsAsync(db),
            "run" => await RunAllAsync(
                pipeline, allTraining, trainSet, evalSet, categoryModel, db, mlSettings, useLlm, forceRetrain),
            _ => PrintUsage()
        };
    }

    private static void PrintCatalogSummary(CategoryCatalog catalog, TextWriter diagnostics)
    {
        IReadOnlyList<CategoryInfo> untrained = catalog.GetUntrainedCategories();
        if (untrained.Count > 0)
        {
            diagnostics.WriteLine(
                $"Category catalog: {catalog.AllCategories.Count} assignable, " +
                $"{untrained.Count} never classified in training (LLM/manual).");
        }
    }

    private static async Task<int> RunAllAsync(
        CategorizationPipeline pipeline,
        TrainingTransaction[] allTraining,
        TrainingTransaction[] trainSet,
        TrainingTransaction[] evalSet,
        CategoryClassificationModel categoryModel,
        BudgetToolsContext db,
        MlSettings settings,
        bool useLlm,
        bool forceRetrain)
    {
        Evaluate(pipeline, trainSet, evalSet, categoryModel, settings);
        ExportTrainingCsv(allTraining, settings);
        return await PredictAfterTrainAsync(pipeline, allTraining, db, settings, useLlm, forceRetrain);
    }

    private static int Train(
        CategorizationPipeline pipeline,
        TrainingTransaction[] trainSet,
        bool forceRetrain,
        TextWriter? diagnostics = null)
    {
        TextWriter output = diagnostics ?? Console.Out;
        output.WriteLine($"Training on {trainSet.Length} accepted, categorized transactions...");
        Time(output, "rebuild lookups + load models", () =>
        {
            pipeline.Train(trainSet, forceRetrain);
            return 0;
        });
        output.WriteLine(
            $"Training complete. Ambiguous merchants indexed: " +
            $"{pipeline.AmbiguousIndex.AmbiguousPayeeCount} payees, " +
            $"{pipeline.AmbiguousIndex.AmbiguousImportCount} import keys. " +
            $"Payee clusters: {pipeline.PayeeClusterIndex.CanonicalPayeeCount} canonical, " +
            $"{pipeline.PayeeClusterIndex.TotalVariantCount} variants.");
        return 0;
    }

    private static int Evaluate(
        CategorizationPipeline pipeline,
        TrainingTransaction[] trainSet,
        TrainingTransaction[] evalSet,
        CategoryClassificationModel categoryModel,
        MlSettings settings)
    {
        pipeline.Train(trainSet, forceRetrain: true);

        IReadOnlyList<(CategorizationResult Result, bool Correct)> labeled = pipeline.EvaluateLabeled(evalSet);
        int excludedCount = labeled.Count(x => x.Result.IsExcluded);
        int eligibleCount = labeled.Count - excludedCount;
        IReadOnlyList<(CategorizationResult Result, bool Correct)> eligible =
            CategorizationMetrics.EligibleOnly(labeled).ToList();

        Console.WriteLine();
        Console.WriteLine(
            $"=== Pipeline evaluation ({eligibleCount} eligible / {evalSet.Length} held-out, " +
            $"{excludedCount} excluded, consensus gate, LLM off) ===");

        EvaluationMetrics metrics = SummarizeMetrics(eligible);
        Console.WriteLine($"Overall accuracy: {metrics.Accuracy:P1} ({metrics.Correct}/{metrics.Total})");
        Console.WriteLine(
            $"Reliable predictions (>= {settings.ConfidenceThreshold:P0}): {metrics.Reliable} " +
            $"({metrics.ReliableAccuracy:P1} precision)");

        foreach (var (method, count) in metrics.MethodCounts.OrderByDescending(kvp => kvp.Value))
            Console.WriteLine($"  {method}: {count}");

        if (metrics.MethodAccuracy.Count > 0)
        {
            Console.WriteLine();
            Console.WriteLine("Precision by method:");
            foreach (var (method, (correct, total)) in metrics.MethodAccuracy.OrderByDescending(kvp => kvp.Value.Total))
            {
                double pct = total == 0 ? 0 : (double)correct / total;
                Console.WriteLine($"  {method}: {pct:P1} ({correct}/{total})");
            }
        }

        PrintThresholdAnalysis(eligible, eligibleCount);
        PrintStrictConsensusAnalysis(pipeline, evalSet, eligibleCount, settings.Consensus);
        PrintAgreementAnalysis(pipeline, evalSet, eligibleCount);
        PrintPrecisionDrags(eligible);
        PrintPayeeResolutionAnalysis(pipeline, evalSet);

        if (excludedCount > 0)
        {
            Console.WriteLine();
            Console.WriteLine($"Excluded from metrics: {excludedCount} (payee/check — manual only)");
            foreach (var group in labeled.Where(x => x.Result.IsExcluded).GroupBy(x => x.Result.RouteReason))
                Console.WriteLine($"  {group.Key}: {group.Count()}");
        }

        var categoryHoldout = categoryModel.EvaluateHoldout(trainSet, settings.ValidationHoldoutFraction);
        if (categoryHoldout != null)
        {
            Console.WriteLine();
            Console.WriteLine("=== Category model holdout (ML-only) ===");
            Console.WriteLine($"Macro accuracy: {categoryHoldout.Value.Metrics.MacroAccuracy:P1}");
            Console.WriteLine($"Micro accuracy: {categoryHoldout.Value.Metrics.MicroAccuracy:P1}");
            Console.WriteLine($"Log loss: {categoryHoldout.Value.Metrics.LogLoss:F4}");
        }

        return 0;
    }

    private static async Task<int> EvaluateLlmAsync(
        CategorizationPipeline pipeline,
        TrainingTransaction[] trainSet,
        TrainingTransaction[] evalSet,
        LlmSettings llmSettings,
        MlSettings mlSettings)
    {
        if (!llmSettings.HasApiKey)
        {
            Console.WriteLine("LLM evaluation requires Llm:ApiKey or OPENAI_API_KEY.");
            return 1;
        }

        pipeline.Train(trainSet, forceRetrain: false);

        TrainingTransaction[] evalSample = evalSet;
        if (llmSettings.MaxEvalSamples > 0 && evalSet.Length > llmSettings.MaxEvalSamples)
        {
            evalSample = evalSet.Take(llmSettings.MaxEvalSamples).ToArray();
            Console.WriteLine($"LLM eval capped to {evalSample.Length} of {evalSet.Length} holdout transactions.");
        }

        Console.WriteLine();
        Console.WriteLine($"=== LLM evaluation ({evalSample.Length} holdout transactions, model: {llmSettings.Model}) ===");
        Console.WriteLine(
            $"Ambiguous merchants indexed: {pipeline.AmbiguousIndex.AmbiguousPayeeCount} payees, " +
            $"{pipeline.AmbiguousIndex.AmbiguousImportCount} imports");

        IReadOnlyList<(CategorizationResult Result, bool Correct)> labeled =
            await pipeline.EvaluateLabeledAsync(evalSample, useLlm: true);

        IReadOnlyList<(CategorizationResult Result, bool Correct)> eligible =
            CategorizationMetrics.EligibleOnly(labeled).ToList();

        EvaluationMetrics metrics = SummarizeMetrics(eligible);
        Console.WriteLine($"Overall accuracy: {metrics.Accuracy:P1} ({metrics.Correct}/{metrics.Total})");
        Console.WriteLine(
            $"Reliable predictions (>= {mlSettings.ConfidenceThreshold:P0}): {metrics.Reliable} " +
            $"({metrics.ReliableAccuracy:P1} precision)");

        foreach (var (method, count) in metrics.MethodCounts.OrderByDescending(kvp => kvp.Value))
            Console.WriteLine($"  {method}: {count}");

        var llmRows = eligible.Where(x => x.Result.Method == CategorizationMethod.LlmCategorization).ToList();
        if (llmRows.Count > 0)
        {
            int llmCorrect = llmRows.Count(x => x.Correct);
            Console.WriteLine();
            Console.WriteLine(
                $"LLM categorizations: {llmRows.Count} ({(double)llmCorrect / llmRows.Count:P1} accuracy)");

            foreach (var group in llmRows.GroupBy(x => x.Result.RouteReason).OrderByDescending(g => g.Count()))
            {
                int correct = group.Count(x => x.Correct);
                Console.WriteLine($"  {group.Key}: {correct}/{group.Count()} correct");
            }

            Console.WriteLine();
            Console.WriteLine("Sample LLM results:");
            foreach ((CategorizationResult result, bool correct) in llmRows.Take(8))
            {
                string mark = correct ? "ok" : "WRONG";
                Console.WriteLine(
                    $"  [{mark}] [{result.RouteReason}] {result.FeatureText} -> {result.PredictedCategory} ({result.Confidence:P0})");
            }
        }

        var consensusRows = eligible.Where(x => x.Result.Method == CategorizationMethod.Consensus).ToList();
        if (consensusRows.Count > 0)
        {
            int consensusCorrect = consensusRows.Count(x => x.Correct);
            Console.WriteLine();
            Console.WriteLine(
                $"Consensus auto-apply: {consensusRows.Count} ({(double)consensusCorrect / consensusRows.Count:P1} accuracy)");
        }

        var manualRows = eligible.Where(x => x.Result.Method == CategorizationMethod.ManualReview).ToList();
        if (manualRows.Count > 0)
        {
            Console.WriteLine();
            Console.WriteLine($"Routed to manual review: {manualRows.Count}");
            foreach (var group in manualRows.GroupBy(x => x.Result.RouteReason).OrderByDescending(g => g.Count()))
                Console.WriteLine($"  {group.Key}: {group.Count()}");
        }

        return 0;
    }

    private static void PrintStrictConsensusAnalysis(
        CategorizationPipeline pipeline,
        TrainingTransaction[] evalSet,
        int eligibleCount,
        ConsensusSettings consensus)
    {
        IReadOnlyList<SignalRow> signalRows = pipeline.CollectSignalRows(evalSet);
        var productionRows = signalRows
            .Where(r => !r.IsExcluded)
            .Where(r => !pipeline.AmbiguousIndex.IsAmbiguous(ToPendingForEval(r.Transaction)))
            .Select(r => (r.Signals, r.Transaction.CategoryName, IsExcluded: false))
            .ToList();

        AgreementMetrics strict = AgreementAnalysis.ComputeStrict(productionRows, eligibleCount, consensus).Single();

        Console.WriteLine();
        Console.WriteLine("=== Strict consensus (production auto-apply gate) ===");
        string gateDescription = consensus.AllowStrongSignalPair
            ? $"(or {consensus.MinAgreeingMethodsWithStrongSignal}+ with ImportAmount/Hierarchical, "
              + $"or ImportAmount solo >= {consensus.ImportAmountSoloThreshold:P0})"
            : $"or ImportAmount solo >= {consensus.ImportAmountSoloThreshold:P0}";

        Console.WriteLine(
            $"  >= {consensus.ConfidenceThreshold:P0}, {consensus.MinAgreeingMethods}+ methods {gateDescription}");
        Console.WriteLine(
            consensus.EligibleMethods.Length > 0
                ? $"  Eligible methods: {string.Join(", ", consensus.EligibleMethods)}"
                : $"  Excludes: {string.Join(", ", consensus.ExcludedMethods)}");
        Console.WriteLine(
            $"  Skips ambiguous merchants (multi-category in training)");
        Console.WriteLine(
            $"  precision {strict.Precision:P1} ({strict.Correct}/{strict.Applied}), " +
            $"coverage {strict.Coverage:P1}");
    }

    private static PendingTransaction ToPendingForEval(TrainingTransaction transaction) =>
        new(
            transaction.Id,
            transaction.ImportPayeeNameOriginal,
            transaction.ImportPayeeName,
            transaction.PayeeName,
            transaction.PayeeId,
            transaction.Amount,
            transaction.AccountName,
            transaction.Memo,
            transaction.Date);

    private static int Diagnose(
        CategorizationPipeline pipeline,
        TrainingTransaction[] trainSet,
        TrainingTransaction[] evalSet,
        MlSettings settings)
    {
        pipeline.Train(trainSet, forceRetrain: false);

        IReadOnlyList<SignalRow> signalRows = pipeline.CollectSignalRows(evalSet);
        int eligible = signalRows.Count(r => !r.IsExcluded);

        Console.WriteLine();
        Console.WriteLine($"=== Misclassification diagnosis ({eligible} eligible transactions) ===");

        foreach ((int minMethods, float threshold) in new[] { (settings.Consensus.MinAgreeingMethods, settings.Consensus.ConfidenceThreshold) })
        {
            IReadOnlyList<MisclassificationExample> errors =
                MisclassificationDiagnostic.FindStrictConsensusErrors(signalRows, settings.Consensus);
            MisclassificationDiagnostic.PrintReport(
                errors,
                settings.Consensus.ConfidenceThreshold,
                settings.Consensus.MinAgreeingMethods);
            break;
        }

        return 0;
    }

    private static int AnalyzeGap(
        CategorizationPipeline pipeline,
        TrainingTransaction[] trainSet,
        TrainingTransaction[] evalSet,
        CategoryCatalog catalog,
        MlSettings settings)
    {
        pipeline.Train(trainSet, forceRetrain: false);

        IReadOnlyList<SignalRow> signalRows = pipeline.CollectSignalRows(evalSet);
        ConsensusGapReport report = ConsensusGapAnalysis.Analyze(
            signalRows,
            pipeline.AmbiguousIndex,
            catalog,
            settings.Consensus);

        IReadOnlyList<ConsensusGapExample> samples = ConsensusGapAnalysis.FindRecoverableExamples(
            signalRows,
            pipeline.AmbiguousIndex,
            catalog,
            settings.Consensus,
            limit: 15);

        ConsensusGapAnalysis.PrintReport(report, settings.Consensus, samples);
        return 0;
    }

    private static EvaluationMetrics SummarizeMetrics(
        IReadOnlyList<(CategorizationResult Result, bool Correct)> labeled)
    {
        int correct = 0;
        int reliable = 0;
        int reliableCorrect = 0;
        var methodCounts = new Dictionary<CategorizationMethod, int>();
        var methodAccuracy = new Dictionary<CategorizationMethod, (int Correct, int Total)>();

        foreach ((CategorizationResult result, bool isCorrect) in labeled)
        {
            methodCounts[result.Method] = methodCounts.GetValueOrDefault(result.Method) + 1;

            if (result.Method is not (
                CategorizationMethod.None
                or CategorizationMethod.ManualReview
                or CategorizationMethod.Excluded))
            {
                (int Correct, int Total) stats = methodAccuracy.GetValueOrDefault(result.Method);
                methodAccuracy[result.Method] = (stats.Correct + (isCorrect ? 1 : 0), stats.Total + 1);
            }

            if (isCorrect)
                correct++;

            if (result.IsReliable)
            {
                reliable++;
                if (isCorrect)
                    reliableCorrect++;
            }
        }

        return new EvaluationMetrics
        {
            Total = labeled.Count,
            Correct = correct,
            Reliable = reliable,
            ReliableCorrect = reliableCorrect,
            MethodCounts = methodCounts,
            MethodAccuracy = methodAccuracy
        };
    }

    private static void PrintThresholdAnalysis(
        IReadOnlyList<(CategorizationResult Result, bool Correct)> labeled,
        int total)
    {
        Console.WriteLine();
        Console.WriteLine("=== Auto-apply precision by confidence threshold ===");
        Console.WriteLine("(Precision = correct / applied; Coverage = applied / eligible txs)");
        Console.WriteLine();
        Console.WriteLine("  All methods:");
        foreach (ThresholdMetrics row in ThresholdAnalysis.Compute(labeled, total))
        {
            Console.WriteLine(
                $"    >= {row.Threshold:P0}: precision {row.Precision:P1} ({row.Correct}/{row.Applied}), " +
                $"coverage {row.Coverage:P1} ({row.Applied}/{row.Total})");
        }

        Console.WriteLine();
        Console.WriteLine("  Lookup-only (safest tier):");
        foreach (ThresholdMetrics row in ThresholdAnalysis.ComputeLookupOnly(labeled, total))
        {
            Console.WriteLine(
                $"    >= {row.Threshold:P0}: precision {row.Precision:P1} ({row.Correct}/{row.Applied}), " +
                $"coverage {row.Coverage:P1} ({row.Applied}/{row.Total})");
        }
    }

    private static void PrintAgreementAnalysis(
        CategorizationPipeline pipeline,
        TrainingTransaction[] evalSet,
        int eligibleCount)
    {
        IReadOnlyList<(IReadOnlyList<MethodSignal> Signals, string ActualCategory, bool IsExcluded)> signalRows =
            pipeline.CollectSignals(evalSet);

        Console.WriteLine();
        Console.WriteLine("=== Multi-method agreement (eligible txs only) ===");
        Console.WriteLine("Auto-apply only when N distinct methods agree on the same category.");

        foreach (float threshold in new[] { 0.85f, 0.90f, 0.95f })
        {
            Console.WriteLine();
            Console.WriteLine($"  Confidence >= {threshold:P0}:");
            foreach (AgreementMetrics row in AgreementAnalysis.Compute(signalRows, eligibleCount, threshold))
            {
                Console.WriteLine(
                    $"    {row.MinAgreeingMethods}+ methods agree: precision {row.Precision:P1} " +
                    $"({row.Correct}/{row.Applied}), coverage {row.Coverage:P1}");
            }
        }
    }

    private static void PrintPrecisionDrags(
        IReadOnlyList<(CategorizationResult Result, bool Correct)> eligible)
    {
        var drags = AgreementAnalysis.ComputeMethodErrors(eligible);
        if (drags.Count == 0)
            return;

        Console.WriteLine();
        Console.WriteLine("=== Reliable prediction error rate by method ===");
        foreach (var (method, wrong, total, errorRate) in drags)
            Console.WriteLine($"  {method}: {errorRate:P1} wrong ({wrong}/{total} reliable predictions)");
    }

    private static void PrintPayeeResolutionAnalysis(
        CategorizationPipeline pipeline,
        TrainingTransaction[] evalSet)
    {
        PayeeResolutionMetrics metrics = pipeline.EvaluatePayeeResolution(evalSet);

        Console.WriteLine();
        Console.WriteLine("=== Payee resolution (holdout) ===");
        Console.WriteLine(
            $"Canonical payee accuracy: {metrics.Accuracy:P1} ({metrics.Correct}/{metrics.Total})");
        Console.WriteLine(
            $"Resolution rate: {metrics.ResolutionRate:P1} " +
            $"({metrics.ExactLookup + metrics.ClusterLookup + metrics.Model}/{metrics.Total})");
        Console.WriteLine($"  Exact lookup: {metrics.ExactLookup}");
        Console.WriteLine($"  Cluster lookup: {metrics.ClusterLookup}");
        Console.WriteLine($"  Model: {metrics.Model}");
        Console.WriteLine($"  Unresolved: {metrics.Unresolved}");

        if (metrics.NovelImports > 0)
        {
            Console.WriteLine(
                $"Novel imports: {metrics.NovelImports} " +
                $"(cluster resolved: {metrics.NovelClusterResolved}, " +
                $"model resolved: {metrics.NovelModelResolved})");
        }

        Console.WriteLine(
            $"Payee clusters indexed: {pipeline.PayeeClusterIndex.CanonicalPayeeCount} canonical payees, " +
            $"{pipeline.PayeeClusterIndex.TotalVariantCount} variants");
    }

    private static async Task<int> PredictAfterTrainAsync(
        CategorizationPipeline pipeline,
        TrainingTransaction[] trainingData,
        BudgetToolsContext db,
        MlSettings settings,
        bool useLlm,
        bool forceRetrain)
    {
        Train(pipeline, trainingData, forceRetrain);
        RebuildPeriodicIndex(pipeline, db, Console.Out);
        return await PredictAsync(pipeline, db, settings, useLlm);
    }

    private static async Task<int> PredictAsync(
        CategorizationPipeline pipeline,
        BudgetToolsContext db,
        MlSettings settings,
        bool useLlm)
    {
        PendingTransaction[] pending = TransactionQueries.GetPendingTransactions(db);
        Console.WriteLine();
        Console.WriteLine($"=== Predicting categories for {pending.Length} pending transactions ===");
        Console.WriteLine(useLlm ? "LLM routing: enabled" : "LLM routing: disabled (pass --llm or set Llm:Enabled)");

        ConfigureTravelBias(pipeline);

        IReadOnlyList<CategorizationProposal> proposals =
            await pipeline.PredictPendingDetailedAsync(pending, useLlm);

        CategorizationProposalQueueSummary summary = pipeline.SummarizeQueue(proposals);

        Console.WriteLine($"Auto-apply: {summary.AutoApply}");
        Console.WriteLine($"Suggested (1-tap approve): {summary.Suggested}");
        Console.WriteLine($"Needs review: {summary.Review}");
        Console.WriteLine($"Blocked: {summary.Blocked}");

        foreach (var group in proposals.GroupBy(p => p.Tier).OrderByDescending(g => g.Count()))
            Console.WriteLine($"  {group.Key}: {group.Count()}");

        Console.WriteLine();
        Console.WriteLine("Sample auto-apply:");
        foreach (CategorizationProposal p in proposals.Where(p => p.Tier == ApprovalTier.AutoApply).Take(5))
            PrintProposalLine(p);

        Console.WriteLine();
        Console.WriteLine("Sample suggested (approve in UI):");
        foreach (CategorizationProposal p in proposals.Where(p => p.Tier == ApprovalTier.Suggested).Take(5))
            PrintProposalLine(p);

        Console.WriteLine();
        Console.WriteLine("Sample review queue:");
        foreach (CategorizationProposal p in proposals.Where(p => p.Tier == ApprovalTier.Review).Take(5))
            PrintProposalLine(p);

        return 0;
    }

    private static async Task<int> PredictJsonAsync(
        CategorizationPipeline pipeline,
        TrainingTransaction[] trainingData,
        BudgetToolsContext db,
        MlSettings settings,
        bool useLlm,
        bool forceRetrain,
        TextWriter diagnostics,
        string[] args)
    {
        Train(pipeline, trainingData, forceRetrain, diagnostics);
        RebuildPeriodicIndex(pipeline, db, diagnostics);
        IReadOnlyList<string>? transactionIds = ParseCsvOption(args, "--ids");
        int? limit = ParsePositiveIntOption(args, "--limit");
        PendingTransaction[] pending = Time(
            diagnostics,
            "load pending transactions",
            () => SelectPendingTransactions(db, transactionIds, limit));
        diagnostics.WriteLine($"[timing] pending count: {pending.Length}");

        ConfigureTravelBias(pipeline);

        IReadOnlyList<CategorizationProposal> proposals = await TimeAsync(
            diagnostics,
            "score pending transactions",
            () => pipeline.PredictPendingDetailedAsync(pending, useLlm));

        var jsonOptions = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            WriteIndented = true,
            Converters = { new JsonStringEnumConverter() }
        };

        var payload = new
        {
            summary = pipeline.SummarizeQueue(proposals),
            proposals
        };

        string json = Time(
            diagnostics,
            "serialize json",
            () => JsonSerializer.Serialize(payload, jsonOptions));
        Console.WriteLine(json);
        return 0;
    }

    private static void ConfigureTravelBias(CategorizationPipeline pipeline)
    {
        (bool enabled, IReadOnlyList<TravelWindowRecord> windows) =
            TravelSqliteStore.Load(Environment.GetEnvironmentVariable("SQLITE_DB_PATH"));
        pipeline.ConfigureTravelBias(enabled, windows);
    }

    private static async Task<int> FeedbackStatsAsync(BudgetToolsContext db)
    {
        var feedbackService = new CategorizationFeedbackService(db);
        FeedbackAccuracySummary summary = await feedbackService.GetAccuracySummaryAsync();

        Console.WriteLine();
        Console.WriteLine("=== Categorization feedback summary ===");
        Console.WriteLine($"Total recorded: {summary.Total}");
        Console.WriteLine($"Approved: {summary.Approved}");
        Console.WriteLine($"Changed: {summary.Changed}");
        Console.WriteLine($"Rejected: {summary.Rejected}");
        Console.WriteLine($"Acceptance rate: {summary.AcceptanceRate:P1}");
        Console.WriteLine($"Suggestion follow rate: {summary.SuggestionFollowRate:P1}");
        Console.WriteLine();
        Console.WriteLine(
            "Note: retraining uses approved categorized transactions synced to the database. " +
            "Feedback is an audit trail until the transaction category is saved and synced.");

        return 0;
    }

    private static void PrintProposalLine(CategorizationProposal proposal)
    {
        string category = proposal.SuggestedCategory ?? "(none)";
        string methods = proposal.AgreeingSignals.Count > 0
            ? string.Join(", ", proposal.AgreeingSignals.Select(s => s.Method))
            : proposal.Method.ToString();

        Console.WriteLine(
            $"  [{proposal.Tier}/{proposal.GapReason}] {proposal.FeatureText} -> {category} " +
            $"({proposal.Confidence:P0}) [{methods}]");

        if (proposal.Options.Count > 1)
        {
            string options = string.Join(", ",
                proposal.Options.Take(3).Select(o => $"{o.Rank}. {o.Category} ({o.Confidence:P0})"));
            Console.WriteLine($"    options: {options}");
        }
    }

    private static int ExportTrainingCsv(TrainingTransaction[] transactions, MlSettings settings)
    {
        var rows = new List<object>();
        foreach (TrainingTransaction t in transactions)
        {
            foreach (CategoryTrainingExample ex in TrainingDataBuilder.BuildCategoryExamples([t]))
            {
                rows.Add(new { text = ex.FeatureText, category = ex.CategoryName, group = t.CategoryGroupName });
            }
        }

        rows = rows.Distinct().ToList();

        using var writer = new StreamWriter(settings.ExportCsvPath);
        using var csv = new CsvWriter(writer, CultureInfo.InvariantCulture);
        csv.WriteRecords(rows);

        Console.WriteLine($"Exported {rows.Count} training rows to {settings.ExportCsvPath}");
        return 0;
    }

    private static (TrainingTransaction[] Train, TrainingTransaction[] Eval) SplitByDate(
        TrainingTransaction[] transactions,
        float holdoutFraction)
    {
        TrainingTransaction[] ordered = transactions.OrderBy(t => t.Date).ThenBy(t => t.Id).ToArray();
        int evalCount = Math.Max(1, (int)Math.Round(ordered.Length * holdoutFraction));
        int trainCount = ordered.Length - evalCount;

        return (
            ordered[..trainCount],
            ordered[trainCount..]);
    }

    private static int PrintUsage()
    {
        Console.WriteLine("""
            YNAB Category AI — usage:
              dotnet run                         Full pipeline (train, evaluate, predict)
              dotnet run train [--force]         Train lookup tables and ML models
              dotnet run evaluate                Evaluate consensus pipeline on holdout
              dotnet run evaluate-llm            Evaluate with OpenAI LLM fallback (requires API key)
              dotnet run diagnose                Show misclassification examples under strict consensus
              dotnet run analyze-gap             Break down manual-review gap and recoverable coverage
              dotnet run predict [--force]       Categorize pending transactions (tiered output)
              dotnet run predict-json [--force] [--limit N] [--ids id,id]
                                         Emit JSON proposals for API/UI integration
                                         --ids scores those transactions (order preserved)
                                         --limit scores the N newest pending (ignored when --ids is set)
              dotnet run feedback-stats          Summarize recorded approval/denial feedback
              dotnet run predict --llm           Include LLM for ambiguous/novel transactions
              dotnet run export                  Export training CSV from database

            LLM config: Llm:Enabled + Llm:ApiKey in appsettings.Local.json or OPENAI_API_KEY env var
            """);
        return 1;
    }

    private static PendingTransaction[] SelectPendingTransactions(
        BudgetToolsContext db,
        IReadOnlyList<string>? transactionIds,
        int? limit)
    {
        if (transactionIds is not null)
        {
            return TransactionQueries.GetPendingTransactions(db, transactionIds);
        }

        PendingTransaction[] pending = TransactionQueries.GetPendingTransactions(db);
        if (limit is null)
        {
            return pending;
        }

        return pending
            .OrderByDescending(transaction => transaction.Date)
            .ThenBy(transaction => transaction.Id, StringComparer.Ordinal)
            .Take(limit.Value)
            .ToArray();
    }

    private static IReadOnlyList<string>? ParseCsvOption(string[] args, string name)
    {
        string? raw = GetOptionValue(args, name);
        if (raw is null)
        {
            return null;
        }

        return raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    }

    private static int? ParsePositiveIntOption(string[] args, string name)
    {
        string? raw = GetOptionValue(args, name);
        if (raw is null)
        {
            return null;
        }

        if (!int.TryParse(raw, out int value) || value < 1)
        {
            throw new InvalidOperationException($"{name} must be a positive integer.");
        }

        return value;
    }

    private static string? GetOptionValue(string[] args, string name)
    {
        for (int index = 0; index < args.Length; index++)
        {
            string argument = args[index];
            if (argument.Equals(name, StringComparison.OrdinalIgnoreCase))
            {
                if (index + 1 >= args.Length || args[index + 1].StartsWith("--", StringComparison.Ordinal))
                {
                    throw new InvalidOperationException($"{name} requires a value.");
                }

                return args[index + 1];
            }

            string prefix = name + "=";
            if (argument.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                string value = argument[prefix.Length..];
                if (string.IsNullOrWhiteSpace(value))
                {
                    throw new InvalidOperationException($"{name} requires a value.");
                }

                return value;
            }
        }

        return null;
    }

    private static void RebuildPeriodicIndex(
        CategorizationPipeline pipeline,
        BudgetToolsContext db,
        TextWriter diagnostics)
    {
        PeriodicHistoryTransaction[] history = Time(
            diagnostics,
            "load periodic history",
            () => TransactionQueries.GetPeriodicHistory(db));
        pipeline.TrainPeriodic(history);
        diagnostics.WriteLine(
            $"[timing] periodic series index: {pipeline.PeriodicIndex.LastTrainElapsed.TotalMilliseconds:F1}ms " +
            $"({pipeline.PeriodicIndex.SeriesCount} series from {history.Length} history rows)");
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
