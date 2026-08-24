using YnabCategoryAi.Configuration;
using YnabCategoryAi.Data;

namespace YnabCategoryAi.ML;

public static class PeriodicScoring
{
    public static bool IsStable(PeriodicMatch match, PeriodicSeriesSettings settings) =>
        !CategoryNormalizer.IsExcludedName(match.Category)
        && match.CategoryVoteShare >= settings.StableCategoryVoteShare;

    public static bool TryCreateSignal(
        PeriodicMatch match,
        PeriodicSeriesSettings settings,
        out MethodSignal signal)
    {
        signal = default;
        if (!IsStable(match, settings) || match.Category == null)
            return false;

        signal = new MethodSignal(
            CategorizationMethod.PeriodicSeriesLookup,
            match.Category,
            match.CategoryVoteShare);
        return true;
    }

    public static bool IsConflict(
        PeriodicMatch? match,
        string? consensusCategory,
        IReadOnlyList<MethodSignal> signals,
        ConsensusSettings consensusSettings,
        PeriodicSeriesSettings periodicSettings)
    {
        if (match == null || !IsStable(match, periodicSettings))
            return false;

        if (consensusCategory != null
            && !CategoryNormalizer.AreEquivalent(match.Category, consensusCategory))
        {
            return true;
        }

        return signals
            .Where(signal => signal.Confidence >= consensusSettings.ConfidenceThreshold)
            .Where(signal => consensusSettings.IsEligible(signal.Method))
            .Where(signal => signal.Method != CategorizationMethod.PeriodicSeriesLookup)
            .Any(signal => !CategoryNormalizer.AreEquivalent(signal.Category, match.Category));
    }
}
