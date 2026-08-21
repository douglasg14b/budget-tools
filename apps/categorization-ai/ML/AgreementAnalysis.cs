namespace YnabCategoryAi.ML;

using YnabCategoryAi.Configuration;
using YnabCategoryAi.Data;

public readonly record struct MethodSignal(
    CategorizationMethod Method,
    string Category,
    float Confidence);

public sealed class AgreementMetrics
{
    public required int MinAgreeingMethods { get; init; }
    public required float ConfidenceThreshold { get; init; }
    public required int Applied { get; init; }
    public required int Correct { get; init; }
    public required int Total { get; init; }
    public double Precision => Applied == 0 ? 0 : (double)Correct / Applied;
    public double Coverage => Total == 0 ? 0 : (double)Applied / Total;
}

public static class AgreementAnalysis
{
    public static IReadOnlyList<AgreementMetrics> Compute(
        IEnumerable<(IReadOnlyList<MethodSignal> Signals, string ActualCategory, bool IsExcluded)> rows,
        int totalEligible,
        float confidenceThreshold,
        int maxMethods = 4)
    {
        var data = rows.Where(r => !r.IsExcluded).ToList();
        var results = new List<AgreementMetrics>();

        for (int minMethods = 1; minMethods <= maxMethods; minMethods++)
        {
            int applied = 0;
            int correct = 0;

            foreach (var row in data)
            {
                if (!TryGetConsensus(row.Signals, confidenceThreshold, minMethods, out string? category))
                    continue;

                applied++;
                if (string.Equals(category, row.ActualCategory, StringComparison.OrdinalIgnoreCase))
                    correct++;
            }

            results.Add(new AgreementMetrics
            {
                MinAgreeingMethods = minMethods,
                ConfidenceThreshold = confidenceThreshold,
                Applied = applied,
                Correct = correct,
                Total = totalEligible
            });
        }

        return results;
    }

    public static bool TryGetConsensus(
        IReadOnlyList<MethodSignal> signals,
        float confidenceThreshold,
        int minAgreeingMethods,
        out string? category)
    {
        category = null;

        var qualifying = signals
            .Where(s => s.Confidence >= confidenceThreshold)
            .GroupBy(s => s.Category, StringComparer.OrdinalIgnoreCase)
            .Select(g => new
            {
                Category = g.Key,
                MethodCount = g.Select(x => x.Method).Distinct().Count(),
                AvgConfidence = g.Average(x => x.Confidence)
            })
            .Where(x => x.MethodCount >= minAgreeingMethods)
            .OrderByDescending(x => x.MethodCount)
            .ThenByDescending(x => x.AvgConfidence)
            .ToList();

        if (qualifying.Count == 0)
            return false;

        category = qualifying[0].Category;
        return true;
    }

    public static bool TryGetConsensusDetailed(
        IReadOnlyList<MethodSignal> signals,
        float confidenceThreshold,
        int minAgreeingMethods,
        out string? category,
        out IReadOnlyList<MethodSignal> agreeingSignals)
    {
        agreeingSignals = [];
        category = null;

        var qualifying = signals
            .Where(s => s.Confidence >= confidenceThreshold)
            .GroupBy(s => s.Category, StringComparer.OrdinalIgnoreCase)
            .Select(g => new
            {
                Category = g.Key,
                MethodCount = g.Select(x => x.Method).Distinct().Count(),
                AvgConfidence = g.Average(x => x.Confidence),
                Signals = g.ToList()
            })
            .Where(x => x.MethodCount >= minAgreeingMethods)
            .OrderByDescending(x => x.MethodCount)
            .ThenByDescending(x => x.AvgConfidence)
            .ToList();

        if (qualifying.Count == 0)
            return false;

        category = qualifying[0].Category;
        agreeingSignals = qualifying[0].Signals;
        return true;
    }

    public static bool TryGetStrictConsensus(
        IReadOnlyList<MethodSignal> signals,
        ConsensusSettings settings,
        out string? category,
        out IReadOnlyList<MethodSignal> agreeingSignals,
        out float confidence)
    {
        agreeingSignals = [];
        category = null;
        confidence = 0;

        var strongMethods = settings.StrongSignalMethods.ToHashSet();

        List<MethodSignal> eligible = signals
            .Where(s => s.Confidence >= settings.ConfidenceThreshold)
            .Where(s => settings.IsEligible(s.Method))
            .ToList();

        MethodSignal? soloImportAmount = eligible
            .Where(s => s.Method == CategorizationMethod.ImportAmountLookup)
            .OrderByDescending(s => s.Confidence)
            .FirstOrDefault();

        if (soloImportAmount != null
            && soloImportAmount.Value.Confidence >= settings.ImportAmountSoloThreshold)
        {
            category = soloImportAmount.Value.Category;
            agreeingSignals = [soloImportAmount.Value];
            confidence = soloImportAmount.Value.Confidence;
            return true;
        }

        var qualifying = eligible
            .GroupBy(s => s.Category, StringComparer.OrdinalIgnoreCase)
            .Select(g => new
            {
                Category = g.Key,
                MethodCount = g.Select(x => x.Method).Distinct().Count(),
                AvgConfidence = g.Average(x => x.Confidence),
                HasStrongSignal = g.Any(x => strongMethods.Contains(x.Method)),
                Signals = g.ToList()
            })
            .Where(x =>
                x.MethodCount >= settings.MinAgreeingMethods
                || (settings.AllowStrongSignalPair
                    && x.MethodCount >= settings.MinAgreeingMethodsWithStrongSignal
                    && x.HasStrongSignal))
            .OrderByDescending(x => x.MethodCount)
            .ThenByDescending(x => x.AvgConfidence)
            .ToList();

        if (qualifying.Count == 0)
            return false;

        category = qualifying[0].Category;
        agreeingSignals = qualifying[0].Signals;
        confidence = (float)qualifying[0].AvgConfidence;
        return true;
    }

    public static IReadOnlyList<AgreementMetrics> ComputeStrict(
        IEnumerable<(IReadOnlyList<MethodSignal> Signals, string ActualCategory, bool IsExcluded)> rows,
        int totalEligible,
        ConsensusSettings settings)
    {
        var data = rows.Where(r => !r.IsExcluded).ToList();
        int applied = 0;
        int correct = 0;

        foreach (var row in data)
        {
            if (!TryGetStrictConsensus(row.Signals, settings, out string? category, out _, out _))
                continue;

            applied++;
            if (CategoryNormalizer.AreEquivalent(category, row.ActualCategory))
                correct++;
        }

        return
        [
            new AgreementMetrics
            {
                MinAgreeingMethods = settings.MinAgreeingMethods,
                ConfidenceThreshold = settings.ConfidenceThreshold,
                Applied = applied,
                Correct = correct,
                Total = totalEligible
            }
        ];
    }

    public static IReadOnlyList<(CategorizationMethod Method, int Wrong, int Total, double ErrorRate)> ComputeMethodErrors(
        IEnumerable<(CategorizationResult Result, bool Correct)> labeled)
    {
        return labeled
            .Where(x => CategorizationMetrics.IsEligibleForMetrics(x.Result))
            .Where(x => x.Result.PredictedCategory != null)
            .Where(x => x.Result.IsReliable)
            .GroupBy(x => x.Result.Method)
            .Select(g =>
            {
                int wrong = g.Count(x => !x.Correct);
                int total = g.Count();
                return (g.Key, wrong, total, total == 0 ? 0 : (double)wrong / total);
            })
            .OrderByDescending(x => x.Item4)
            .ToList();
    }
}
