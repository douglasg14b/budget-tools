using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Serilog;

namespace YnabCategoryAi;

public static class PredictServer
{
  private static readonly JsonSerializerOptions JsonOptions = new()
  {
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    Converters = { new JsonStringEnumConverter() },
  };

  public static async Task<int> RunAsync(string[] args)
  {
    SessionLog.Start(jsonStdout: false);

    try
    {
      IConfiguration config = new ConfigurationBuilder()
        .SetBasePath(Directory.GetCurrentDirectory())
        .AddJsonFile("appsettings.json", optional: true)
        .AddJsonFile("appsettings.Local.json", optional: true)
        .AddEnvironmentVariables()
        .Build();

      Configuration.ServerSettings serverSettings =
        config.GetSection("Server").Get<Configuration.ServerSettings>()
        ?? new Configuration.ServerSettings();

      bool forceRetrain = args.Contains("--force", StringComparer.OrdinalIgnoreCase);
      Log.Information("Warming scoring session...");
      ScoringSession session = await ScoringSession.CreateAsync(config, forceRetrain, Console.Out);
      Log.Information("Scoring session ready (model signature {Signature})", session.ModelSignature);

      WebApplicationBuilder builder = WebApplication.CreateBuilder(args);
      builder.WebHost.UseUrls($"http://0.0.0.0:{serverSettings.Port}");
      builder.Services.AddSingleton(session);

      WebApplication app = builder.Build();

      app.MapGet("/health", (ScoringSession scoringSession) =>
        Results.Json(new
        {
          ready = true,
          modelSignature = scoringSession.ModelSignature,
        }));

      app.MapPost("/predict", async (PredictRequest request, ScoringSession scoringSession) =>
      {
        if (request.TransactionIds is null || request.TransactionIds.Count == 0)
        {
          return Results.BadRequest(new { error = "transactionIds must be a non-empty array" });
        }

        try
        {
          PredictJsonPayload payload = await scoringSession.PredictAsync(
            request.TransactionIds,
            request.Llm ?? false,
            Console.Out);
          return Results.Json(payload, JsonOptions);
        }
        catch (Exception exception)
        {
          Log.Error(exception, "Predict request failed");
          return Results.Problem(
            detail: exception.Message,
            statusCode: StatusCodes.Status500InternalServerError);
        }
      });

      app.MapPost("/reload", async (ReloadRequest? request, ScoringSession scoringSession) =>
      {
        try
        {
          await scoringSession.ReloadAsync(request?.ForceRetrain ?? false, Console.Out);
          return Results.Json(new
          {
            reloaded = true,
            modelSignature = scoringSession.ModelSignature,
          });
        }
        catch (Exception exception)
        {
          Log.Error(exception, "Reload request failed");
          return Results.Problem(
            detail: exception.Message,
            statusCode: StatusCodes.Status500InternalServerError);
        }
      });

      await using (session)
      {
        app.Run();
      }

      return 0;
    }
    catch (Exception exception)
    {
      Log.Fatal(exception, "Warm scorer failed to start");
      return 1;
    }
    finally
    {
      await SessionLog.ShutdownAsync();
    }
  }

  private sealed record PredictRequest(IReadOnlyList<string>? TransactionIds, bool? Llm);

  private sealed record ReloadRequest(bool? ForceRetrain);
}
