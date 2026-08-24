namespace YnabCategoryAi.ML;

public enum CategorizationMethod
{
    ImportAmountLookup,
    ImportLookup,
    PayeeIdLookup,
    CanonicalPayeeLookup,
    PayeeClusterLookup,
    PayeeModel,
    HierarchicalModel,
    CategoryModel,
    PeriodicSeriesLookup,
    Consensus,
    LlmCategorization,
    Excluded,
    ManualReview,
    None
}

public enum CategorizationRouteReason
{
    None,
    ExcludedPayee,
    ExcludedCheck,
    AmbiguousMerchant,
    UntrainedCategory,
    NovelImportString,
    LowConfidence
}

public sealed class CategorizationResult
{
    public required string TransactionId { get; init; }
    public string? PredictedCategory { get; init; }
    public string? PredictedCategoryGroup { get; init; }
    public string? ResolvedPayee { get; init; }
    public float Confidence { get; init; }
    public CategorizationMethod Method { get; init; }
    public CategorizationRouteReason RouteReason { get; init; }
    public bool IsReliable { get; init; }
    public bool RequiresManualReview { get; init; }
    public string FeatureText { get; init; } = string.Empty;
    public string? Notes { get; init; }

    public bool IsExcluded => Method == CategorizationMethod.Excluded;
}

public static class CategorizationMetrics
{
    public static bool IsEligibleForMetrics(CategorizationResult result) =>
        result.Method != CategorizationMethod.Excluded;

    public static IEnumerable<(CategorizationResult Result, bool Correct)> EligibleOnly(
        IEnumerable<(CategorizationResult Result, bool Correct)> labeled) =>
        labeled.Where(x => IsEligibleForMetrics(x.Result));
}

public sealed class EvaluationMetrics
{
    public required int Total { get; init; }
    public required int Correct { get; init; }
    public required int Reliable { get; init; }
    public required int ReliableCorrect { get; init; }
    public double Accuracy => Total == 0 ? 0 : (double)Correct / Total;
    public double ReliableAccuracy => Reliable == 0 ? 0 : (double)ReliableCorrect / Reliable;

    public Dictionary<CategorizationMethod, int> MethodCounts { get; init; } = new();

    public Dictionary<CategorizationMethod, (int Correct, int Total)> MethodAccuracy { get; init; } = new();
}

public sealed class ThresholdMetrics
{
    public required float Threshold { get; init; }
    public required int Applied { get; init; }
    public required int Correct { get; init; }
    public required int Total { get; init; }
    public double Precision => Applied == 0 ? 0 : (double)Correct / Applied;
    public double Coverage => Total == 0 ? 0 : (double)Applied / Total;
}

public static class ThresholdAnalysis
{
    private static readonly float[] DefaultThresholds = [0.80f, 0.85f, 0.90f, 0.95f, 0.99f];

    public static IReadOnlyList<ThresholdMetrics> Compute(
        IEnumerable<(CategorizationResult Result, bool Correct)> labeled,
        int total)
    {
        var rows = CategorizationMetrics.EligibleOnly(labeled).ToList();
        return DefaultThresholds
            .Select(threshold =>
            {
                List<(CategorizationResult Result, bool Correct)> applied = rows
                    .Where(r => r.Result.PredictedCategory != null
                        && r.Result.Confidence >= threshold
                        && !r.Result.RequiresManualReview)
                    .ToList();

                int correct = applied.Count(r => r.Correct);
                return new ThresholdMetrics
                {
                    Threshold = threshold,
                    Applied = applied.Count,
                    Correct = correct,
                    Total = total
                };
            })
            .ToList();
    }

    public static IReadOnlyList<ThresholdMetrics> ComputeLookupOnly(
        IEnumerable<(CategorizationResult Result, bool Correct)> labeled,
        int total)
    {
        var rows = CategorizationMetrics.EligibleOnly(labeled).ToList();
        CategorizationMethod[] lookupMethods =
        [
            CategorizationMethod.ImportAmountLookup,
            CategorizationMethod.ImportLookup,
            CategorizationMethod.PayeeIdLookup,
            CategorizationMethod.CanonicalPayeeLookup
        ];

        return DefaultThresholds
            .Select(threshold =>
            {
                List<(CategorizationResult Result, bool Correct)> applied = rows
                    .Where(r => r.Result.PredictedCategory != null
                        && lookupMethods.Contains(r.Result.Method)
                        && r.Result.Confidence >= threshold)
                    .ToList();

                int correct = applied.Count(r => r.Correct);
                return new ThresholdMetrics
                {
                    Threshold = threshold,
                    Applied = applied.Count,
                    Correct = correct,
                    Total = total
                };
            })
            .ToList();
    }
}
