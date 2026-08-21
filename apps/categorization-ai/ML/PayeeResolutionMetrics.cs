namespace YnabCategoryAi.ML;

public enum PayeeResolutionMethod
{
    ExactLookup,
    ClusterLookup,
    Model,
    Unresolved
}

public readonly record struct PayeeResolutionResult(
    PayeeResolutionMethod Method,
    string? ResolvedPayee,
    float Confidence);

public sealed class PayeeResolutionMetrics
{
    public required int Total { get; init; }
    public required int Correct { get; init; }
    public required int ExactLookup { get; init; }
    public required int ClusterLookup { get; init; }
    public required int Model { get; init; }
    public required int Unresolved { get; init; }
    public required int NovelImports { get; init; }
    public required int NovelClusterResolved { get; init; }
    public required int NovelModelResolved { get; init; }

    public double Accuracy => Total == 0 ? 0 : (double)Correct / Total;

    public double ResolutionRate => Total == 0
        ? 0
        : (double)(ExactLookup + ClusterLookup + Model) / Total;
}
