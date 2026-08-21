using YnabCategoryAi.Configuration;

namespace YnabCategoryAi.ML;

public static class TrainingDataOversampler
{
    public static IEnumerable<PayeeMappingExample> Oversample(
        IEnumerable<PayeeMappingExample> examples,
        PayeeResolutionSettings settings)
    {
        var pairCounts = new Dictionary<(string Import, string Canonical), int>();

        foreach (PayeeMappingExample example in examples)
        {
            var key = (example.ImportText, example.CanonicalPayee);
            pairCounts[key] = pairCounts.GetValueOrDefault(key) + 1;
        }

        foreach (PayeeMappingExample example in examples.Distinct())
        {
            int realCount = pairCounts[(example.ImportText, example.CanonicalPayee)];
            int repeatWeight = GetRepeatWeight(realCount, settings);

            for (int i = 0; i < repeatWeight; i++)
                yield return example;
        }
    }

    public static float GetOversampleMultiplier(int realCount, PayeeResolutionSettings settings) =>
        GetRepeatWeight(realCount, settings);

    private static int GetRepeatWeight(int realCount, PayeeResolutionSettings settings) =>
        realCount switch
        {
            1 => settings.OversampleSingletonWeight,
            2 => settings.OversampleDoubleWeight,
            3 or 4 => settings.OversampleTripleWeight,
            _ => 1
        };
}
