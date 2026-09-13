namespace YnabCategoryAi.Configuration;

/// <summary>
/// S3 source for the trained categorization models.
///
/// The models are gitignored binaries produced by `dotnet run -- train`, so a container built
/// from a git clone has no copy of them. When <see cref="Enabled"/> is set, the scorer downloads
/// them into the models directory before warming the scoring session; otherwise it uses whatever
/// is already on disk (the local development flow).
///
/// Bound from the "ModelStorage" configuration section, which maps to `ModelStorage__*`
/// environment variables in the container.
/// </summary>
public class ModelStorageSettings
{
    /// <summary>Whether to fetch models from S3 on startup. Off by default for local runs.</summary>
    public bool Enabled { get; set; }

    /// <summary>S3-compatible endpoint, e.g. https://s3.home.lan (the rust-fs server).</summary>
    public string Endpoint { get; set; } = string.Empty;

    /// <summary>Bucket holding the models. Shares the receipts bucket by default.</summary>
    public string Bucket { get; set; } = string.Empty;

    /// <summary>Key prefix inside the bucket. Must match the upload script's prefix.</summary>
    public string Prefix { get; set; } = "models/";

    public string AccessKeyId { get; set; } = string.Empty;

    public string SecretAccessKey { get; set; } = string.Empty;

    /// <summary>rust-fs ignores region, but the AWS SDK requires a value.</summary>
    public string Region { get; set; } = "us-east-1";

    /// <summary>Path-style addressing ({endpoint}/{bucket}/{key}); required by most self-hosted S3.</summary>
    public bool ForcePathStyle { get; set; } = true;

    public bool IsConfigured =>
        Enabled
        && !string.IsNullOrWhiteSpace(Endpoint)
        && !string.IsNullOrWhiteSpace(Bucket)
        && !string.IsNullOrWhiteSpace(AccessKeyId)
        && !string.IsNullOrWhiteSpace(SecretAccessKey);
}
