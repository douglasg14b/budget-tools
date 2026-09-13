using Microsoft.Extensions.Configuration;
using YnabCategoryAi.Data;

namespace YnabCategoryAi.Configuration;

/// <summary>
/// Binds the <c>ModelStorage</c> configuration section and ensures the trained models are present
/// before a scoring session is created.
/// </summary>
public static class ModelStorageBootstrap
{
    public static async Task EnsureModelsAsync(IConfiguration config, CancellationToken cancellationToken = default)
    {
        ModelStorageSettings settings =
            config.GetSection("ModelStorage").Get<ModelStorageSettings>() ?? new ModelStorageSettings();

        await ModelDownloader.EnsureModelsAsync(settings, ResolveModelsDirectory(config), cancellationToken);
    }

    /// <summary>
    /// Derives the models directory from <c>ML:CategoryModelPath</c> rather than taking a separate
    /// setting, so the download target can never drift from where the models are actually loaded.
    /// </summary>
    private static string ResolveModelsDirectory(IConfiguration config)
    {
        MlSettings mlSettings = config.GetSection("ML").Get<MlSettings>() ?? new MlSettings();
        string? directory = Path.GetDirectoryName(mlSettings.CategoryModelPath);
        return string.IsNullOrWhiteSpace(directory) ? "models" : directory;
    }
}
