using YnabCategoryAi.Configuration;
using YnabCategoryAi.Data;
using YnabCategoryAi.ML.Lookup;

namespace YnabCategoryAi.ML;

public static class PayeeTrainingDataBuilder
{
    public static List<PayeeMappingExample> BuildOversampledExamples(
        IEnumerable<TrainingTransaction> transactions,
        PayeeResolutionSettings settings)
    {
        IEnumerable<PayeeMappingExample> augmented = transactions
            .SelectMany(ImportStringAugmenter.AugmentTransaction);

        return TrainingDataOversampler.Oversample(augmented, settings).ToList();
    }

    public static List<WeightedPayeeImport> BuildWeightedAugmentedImports(
        IEnumerable<TrainingTransaction> transactions,
        DateOnly referenceDate,
        AmbiguitySettings ambiguitySettings,
        PayeeResolutionSettings payeeResolution)
    {
        var augmented = transactions
            .SelectMany(ImportStringAugmenter.AugmentTransactionDetailed)
            .ToList();

        var pairCounts = augmented
            .GroupBy(a => (a.ImportText, a.CanonicalPayee))
            .ToDictionary(g => g.Key, g => g.Count());

        var weighted = new List<WeightedPayeeImport>();

        foreach (TrainingTransaction t in transactions)
        {
            float temporalWeight = TemporalWeighting.ComputeWeight(
                t.Date,
                referenceDate,
                ambiguitySettings.TemporalHalfLifeDays);

            foreach (AugmentedPayeeImport entry in ImportStringAugmenter.AugmentTransactionDetailed(t))
            {
                int realCount = pairCounts[(entry.ImportText, entry.CanonicalPayee)];
                float oversampleMultiplier = TrainingDataOversampler.GetOversampleMultiplier(
                    realCount,
                    payeeResolution);

                weighted.Add(new WeightedPayeeImport(
                    entry.ImportText,
                    entry.CanonicalPayee,
                    temporalWeight * oversampleMultiplier,
                    entry.IsFromImportPayee));
            }
        }

        return weighted;
    }
}
