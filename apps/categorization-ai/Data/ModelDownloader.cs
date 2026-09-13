using System.Security.Cryptography;
using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using Serilog;
using YnabCategoryAi.Configuration;

namespace YnabCategoryAi.Data;

/// <summary>
/// Fetches the trained categorization models from S3 into the local models directory before the
/// scoring session warms up.
///
/// Why this exists: `models/*.zip` are gitignored build artifacts, and production images are built
/// from a git clone, so they cannot be baked in. Publishing them to S3 (see
/// `scripts/upload-categorization-models.mjs`) also decouples retraining from redeploying.
///
/// Ordering matters. <c>CategoryClassificationModel.Train</c> returns early when the model file
/// already exists, and <c>Load</c> reads straight from disk — so the files must land before
/// <c>ScoringSession.CreateAsync</c> runs. Otherwise the scorer would retrain from scratch on
/// every boot.
/// </summary>
public static class ModelDownloader
{
    /// <summary>Artifacts the scoring session loads; names match MlSettings' *ModelPath defaults.</summary>
    private static readonly string[] ModelFiles =
    [
        "category-model.zip",
        "group-model.zip",
        "payee-model.zip"
    ];

    private const string ContentHashKey = "content-sha256";

    /// <summary>
    /// Downloads any model whose local copy is missing or stale. No-ops when S3 model storage is
    /// not configured, which is the local development path.
    /// </summary>
    public static async Task EnsureModelsAsync(
        ModelStorageSettings settings,
        string modelsDirectory,
        CancellationToken cancellationToken = default)
    {
        if (!settings.Enabled)
        {
            Log.Debug("Model storage disabled; using models already on disk");
            return;
        }

        if (!settings.IsConfigured)
        {
            throw new InvalidOperationException(
                "ModelStorage__Enabled is true but the S3 configuration is incomplete. " +
                "Required: ModelStorage__Endpoint, ModelStorage__Bucket, ModelStorage__AccessKeyId, " +
                "ModelStorage__SecretAccessKey.");
        }

        Directory.CreateDirectory(modelsDirectory);

        var config = new AmazonS3Config
        {
            ServiceURL = settings.Endpoint,
            ForcePathStyle = settings.ForcePathStyle,
            AuthenticationRegion = settings.Region
        };

        using var client = new AmazonS3Client(
            new BasicAWSCredentials(settings.AccessKeyId, settings.SecretAccessKey),
            config);

        string prefix = NormalisePrefix(settings.Prefix);
        Log.Information(
            "Ensuring categorization models from {Endpoint}/{Bucket}/{Prefix}",
            settings.Endpoint,
            settings.Bucket,
            prefix);

        foreach (string fileName in ModelFiles)
        {
            await EnsureModelAsync(
                client,
                settings.Bucket,
                prefix + fileName,
                Path.Combine(modelsDirectory, fileName),
                cancellationToken);
        }
    }

    private static async Task EnsureModelAsync(
        IAmazonS3 client,
        string bucket,
        string key,
        string destinationPath,
        CancellationToken cancellationToken)
    {
        string fileName = Path.GetFileName(destinationPath);

        GetObjectMetadataResponse metadata;
        try
        {
            metadata = await client.GetObjectMetadataAsync(bucket, key, cancellationToken);
        }
        catch (AmazonS3Exception ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            throw new InvalidOperationException(
                $"Model '{key}' not found in bucket '{bucket}'. " +
                "Upload the trained models first: `pnpm upload:models`.", ex);
        }

        // The uploader stores the content hash as object metadata so an unchanged model is not
        // re-downloaded on every restart. If it is absent (object written by another tool), fall
        // back to downloading — correctness over the optimisation.
        string? remoteHash = metadata.Metadata[ContentHashKey];
        if (!string.IsNullOrWhiteSpace(remoteHash) && File.Exists(destinationPath))
        {
            string localHash = await ComputeSha256Async(destinationPath, cancellationToken);
            if (string.Equals(localHash, remoteHash, StringComparison.OrdinalIgnoreCase))
            {
                Log.Information("{FileName} is up to date; skipping download", fileName);
                return;
            }
        }

        Log.Information("Downloading {FileName} ({Bytes:N0} bytes)", fileName, metadata.ContentLength);

        // Download to a temp file and move into place, so an interrupted transfer cannot leave a
        // truncated model that ML.NET would then fail to load.
        string tempPath = destinationPath + ".download";
        try
        {
            using (GetObjectResponse response = await client.GetObjectAsync(bucket, key, cancellationToken))
            await using (FileStream destination = File.Create(tempPath))
            {
                await response.ResponseStream.CopyToAsync(destination, cancellationToken);
            }

            File.Move(tempPath, destinationPath, overwrite: true);
            Log.Information("{FileName} ready", fileName);
        }
        finally
        {
            if (File.Exists(tempPath))
            {
                File.Delete(tempPath);
            }
        }
    }

    private static async Task<string> ComputeSha256Async(string path, CancellationToken cancellationToken)
    {
        await using FileStream stream = File.OpenRead(path);
        byte[] hash = await SHA256.HashDataAsync(stream, cancellationToken);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private static string NormalisePrefix(string? prefix)
    {
        string trimmed = (prefix ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            return "models/";
        }

        return trimmed.EndsWith('/') ? trimmed : trimmed + "/";
    }
}
