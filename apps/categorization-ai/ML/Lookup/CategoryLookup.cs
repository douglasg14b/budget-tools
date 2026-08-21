using YnabCategoryAi.Configuration;
using YnabCategoryAi.Data;

namespace YnabCategoryAi.ML.Lookup;

public sealed class CategoryLookup
{
    private readonly MajorityVoteLookup _byPayeeId = new();
    private readonly MajorityVoteLookup _byImportOriginal = new();
    private readonly MajorityVoteLookup _byImportAndAmount = new();
    private readonly MajorityVoteLookup _byCanonicalPayee = new();

    public void Train(
        IEnumerable<TrainingTransaction> transactions,
        AmbiguousMerchantIndex ambiguity,
        DateOnly referenceDate,
        AmbiguitySettings ambiguitySettings)
    {
        _byPayeeId.Clear();
        _byImportOriginal.Clear();
        _byImportAndAmount.Clear();
        _byCanonicalPayee.Clear();

        foreach (TrainingTransaction t in transactions)
        {
            float weight = TemporalWeighting.ComputeWeight(
                t.Date,
                referenceDate,
                ambiguitySettings.TemporalHalfLifeDays);
            string category = t.CategoryName;

            if (!string.IsNullOrWhiteSpace(t.PayeeId)
                && !ambiguity.IsPayeeIdAmbiguous(t.PayeeId))
            {
                _byPayeeId.Add(t.PayeeId, category, weight);
            }

            string? importOriginal = TextPreprocessor.Normalize(t.ImportPayeeNameOriginal);
            if (importOriginal != null)
            {
                string importAmountKey = $"{importOriginal}|{AmountBucketing.Bucket(t.Amount)}";

                if (!ambiguity.IsImportAmbiguous(t.ImportPayeeNameOriginal))
                    _byImportOriginal.Add(importOriginal, category, weight);

                if (!ambiguity.IsImportAmountAmbiguous(t.ImportPayeeNameOriginal, t.Amount))
                    _byImportAndAmount.Add(importAmountKey, category, weight);
            }

            string? canonicalPayee = TextPreprocessor.Normalize(t.PayeeName);
            if (canonicalPayee != null && !ambiguity.IsCanonicalPayeeAmbiguous(t.PayeeName))
                _byCanonicalPayee.Add(canonicalPayee, category, weight);
        }
    }

    public bool TryPredictByImportAndAmount(
        string? importOriginal,
        int amountMilliunits,
        float minVoteShare,
        out LookupPrediction prediction)
    {
        string? normalized = TextPreprocessor.Normalize(importOriginal);
        if (normalized != null
            && _byImportAndAmount.TryPredict(
                $"{normalized}|{AmountBucketing.Bucket(amountMilliunits)}",
                minVoteShare,
                out prediction))
        {
            return true;
        }

        prediction = default;
        return false;
    }

    public bool TryPredictByImportOriginal(string? importOriginal, float minVoteShare, out LookupPrediction prediction)
    {
        string? normalized = TextPreprocessor.Normalize(importOriginal);
        if (normalized != null && _byImportOriginal.TryPredict(normalized, minVoteShare, out prediction))
            return true;

        prediction = default;
        return false;
    }

    /// <summary>
    /// Only predicts when the payee has a single category in history, or vote share exceeds
    /// <paramref name="highConfidenceVoteShare"/> for multi-category payees.
    /// </summary>
    public bool TryPredictByPayeeId(
        string? payeeId,
        float minVoteShare,
        float highConfidenceVoteShare,
        out LookupPrediction prediction)
    {
        prediction = default;

        if (string.IsNullOrWhiteSpace(payeeId))
            return false;

        if (_byPayeeId.IsUnambiguous(payeeId))
            return _byPayeeId.TryPredict(payeeId, minVoteShare: 0.51f, out prediction);

        return _byPayeeId.TryPredict(payeeId, highConfidenceVoteShare, out prediction);
    }

    public bool TryPredictByCanonicalPayee(string? payeeName, float minVoteShare, out LookupPrediction prediction)
    {
        string? normalized = TextPreprocessor.Normalize(payeeName);
        if (normalized != null && _byCanonicalPayee.TryPredict(normalized, minVoteShare, out prediction))
            return true;

        prediction = default;
        return false;
    }
}
