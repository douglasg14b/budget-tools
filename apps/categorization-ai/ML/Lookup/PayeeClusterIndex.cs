using YnabCategoryAi.Configuration;
using YnabCategoryAi.Data;

namespace YnabCategoryAi.ML.Lookup;

/// <summary>
/// Fuzzy payee resolution by matching import strings against canonical-payee variant clusters.
/// </summary>
public sealed class PayeeClusterIndex
{
    private readonly Dictionary<string, HashSet<string>> _variantsByCanonical =
        new(StringComparer.OrdinalIgnoreCase);

    public int CanonicalPayeeCount => _variantsByCanonical.Count;

    public int TotalVariantCount => _variantsByCanonical.Values.Sum(v => v.Count);

    public void Train(
        IEnumerable<TrainingTransaction> transactions,
        IEnumerable<WeightedPayeeImport>? augmentedImports = null)
    {
        _variantsByCanonical.Clear();

        foreach (TrainingTransaction t in transactions)
        {
            if (string.IsNullOrWhiteSpace(t.PayeeName))
                continue;

            foreach (PayeeMappingExample example in ImportStringAugmenter.AugmentTransaction(t))
                AddVariant(example.CanonicalPayee, example.ImportText);
        }

        if (augmentedImports != null)
        {
            foreach (WeightedPayeeImport entry in augmentedImports)
                AddVariant(entry.CanonicalPayee, entry.NormalizedImport);
        }
    }

    public bool TryResolve(
        string? importOriginal,
        string? importPayee,
        PayeeResolutionSettings settings,
        AmbiguousMerchantIndex ambiguousIndex,
        out LookupPrediction prediction)
    {
        prediction = default;

        string? query = TextPreprocessor.Normalize(importOriginal)
            ?? TextPreprocessor.Normalize(importPayee);

        if (query == null)
            return false;

        string? bestCanonical = null;
        double bestScore = 0;
        string? secondCanonical = null;
        double secondScore = 0;

        foreach ((string canonical, HashSet<string> variants) in _variantsByCanonical)
        {
            if (ambiguousIndex.IsCanonicalPayeeAmbiguous(canonical))
                continue;

            double clusterBest = 0;
            foreach (string variant in variants)
            {
                double score = StringSimilarity.RatcliffObershelp(query, variant);
                if (score > clusterBest)
                    clusterBest = score;
            }

            if (clusterBest < settings.FuzzyMatchThreshold)
                continue;

            if (clusterBest > bestScore)
            {
                secondCanonical = bestCanonical;
                secondScore = bestScore;
                bestCanonical = canonical;
                bestScore = clusterBest;
            }
            else if (clusterBest > secondScore)
            {
                secondCanonical = canonical;
                secondScore = clusterBest;
            }
        }

        if (bestCanonical == null)
            return false;

        if (secondCanonical != null
            && bestScore - secondScore < settings.FuzzyAmbiguityMargin)
        {
            return false;
        }

        prediction = new LookupPrediction(
            bestCanonical,
            (float)bestScore,
            _variantsByCanonical[bestCanonical].Count);

        return true;
    }

    private void AddVariant(string canonicalPayee, string normalizedImport)
    {
        if (string.IsNullOrWhiteSpace(canonicalPayee) || string.IsNullOrWhiteSpace(normalizedImport))
            return;

        if (!_variantsByCanonical.TryGetValue(canonicalPayee, out HashSet<string>? variants))
        {
            variants = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            _variantsByCanonical[canonicalPayee] = variants;
        }

        variants.Add(normalizedImport);
    }
}

public readonly record struct WeightedPayeeImport(
    string NormalizedImport,
    string CanonicalPayee,
    float Weight,
    bool IsFromImportPayee);
