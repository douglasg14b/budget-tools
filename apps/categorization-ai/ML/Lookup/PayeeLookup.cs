using YnabCategoryAi.Configuration;
using YnabCategoryAi.Data;

namespace YnabCategoryAi.ML.Lookup;

public sealed class PayeeLookup
{
    private readonly MajorityVoteLookup _byImportOriginal = new();
    private readonly MajorityVoteLookup _byImportPayee = new();

    public void Train(
        IEnumerable<TrainingTransaction> transactions,
        DateOnly referenceDate,
        AmbiguitySettings ambiguitySettings,
        IEnumerable<WeightedPayeeImport>? augmentedImports = null)
    {
        _byImportOriginal.Clear();
        _byImportPayee.Clear();

        foreach (TrainingTransaction t in transactions)
        {
            string? canonicalPayee = t.PayeeName;
            if (string.IsNullOrWhiteSpace(canonicalPayee))
                continue;

            float weight = TemporalWeighting.ComputeWeight(
                t.Date,
                referenceDate,
                ambiguitySettings.TemporalHalfLifeDays);

            string? importOriginal = TextPreprocessor.Normalize(t.ImportPayeeNameOriginal);
            string? importPayee = TextPreprocessor.Normalize(t.ImportPayeeName);

            if (importOriginal != null)
                _byImportOriginal.Add(importOriginal, canonicalPayee, weight);

            if (importPayee != null && importPayee != importOriginal)
                _byImportPayee.Add(importPayee, canonicalPayee, weight);
        }

        if (augmentedImports == null)
            return;

        foreach (WeightedPayeeImport entry in augmentedImports)
        {
            if (entry.IsFromImportPayee)
                _byImportPayee.Add(entry.NormalizedImport, entry.CanonicalPayee, entry.Weight);
            else
                _byImportOriginal.Add(entry.NormalizedImport, entry.CanonicalPayee, entry.Weight);
        }
    }

    public bool TryResolve(
        string? importOriginal,
        string? importPayee,
        float minVoteShare,
        out LookupPrediction prediction,
        out string source)
    {
        string? normalizedOriginal = TextPreprocessor.Normalize(importOriginal);
        if (normalizedOriginal != null
            && _byImportOriginal.TryPredict(normalizedOriginal, minVoteShare, out prediction))
        {
            source = "import_original_lookup";
            return true;
        }

        string? normalizedImportPayee = TextPreprocessor.Normalize(importPayee);
        if (normalizedImportPayee != null
            && _byImportPayee.TryPredict(normalizedImportPayee, minVoteShare, out prediction))
        {
            source = "import_payee_lookup";
            return true;
        }

        prediction = default;
        source = string.Empty;
        return false;
    }
}
