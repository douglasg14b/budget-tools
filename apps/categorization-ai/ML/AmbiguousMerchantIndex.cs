using YnabCategoryAi.Configuration;
using YnabCategoryAi.Data;
using YnabCategoryAi.ML.Lookup;

namespace YnabCategoryAi.ML;

/// <summary>
/// Payees and import strings with conflicting category history (low vote share or multiple labels).
/// Uses temporal weighting and amount buckets for import strings.
/// </summary>
public sealed class AmbiguousMerchantIndex
{
    private readonly MajorityVoteLookup _payeeIdVotes = new();
    private readonly MajorityVoteLookup _canonicalPayeeVotes = new();
    private readonly MajorityVoteLookup _importVotes = new();
    private readonly MajorityVoteLookup _importAmountVotes = new();

    private AmbiguitySettings _settings = new();

    public int AmbiguousPayeeCount { get; private set; }

    public int AmbiguousImportCount { get; private set; }

    public void Train(
        IEnumerable<TrainingTransaction> transactions,
        AmbiguitySettings settings,
        DateOnly referenceDate)
    {
        _settings = settings;
        _payeeIdVotes.Clear();
        _canonicalPayeeVotes.Clear();
        _importVotes.Clear();
        _importAmountVotes.Clear();

        foreach (TrainingTransaction t in transactions)
        {
            float weight = TemporalWeighting.ComputeWeight(t.Date, referenceDate, settings.TemporalHalfLifeDays);
            string category = t.CategoryName;

            if (!string.IsNullOrWhiteSpace(t.PayeeId))
                _payeeIdVotes.Add(t.PayeeId, category, weight);

            string? canonical = TextPreprocessor.Normalize(t.PayeeName);
            if (canonical != null)
                _canonicalPayeeVotes.Add(canonical, category, weight);

            string? import = TextPreprocessor.Normalize(t.ImportPayeeNameOriginal);
            if (import != null)
            {
                _importVotes.Add(import, category, weight);
                _importAmountVotes.Add(ImportAmountKey(import, t.Amount), category, weight);
            }
        }

        AmbiguousPayeeCount = CountAmbiguous(_payeeIdVotes) + CountAmbiguous(_canonicalPayeeVotes);
        AmbiguousImportCount = CountAmbiguous(_importVotes) + CountAmbiguous(_importAmountVotes);
    }

    public bool IsAmbiguous(TrainingTransaction transaction) =>
        IsAmbiguous(ToPending(transaction));

    public bool IsAmbiguous(PendingTransaction transaction)
    {
        if (!string.IsNullOrWhiteSpace(transaction.PayeeId)
            && IsKeyAmbiguous(_payeeIdVotes, transaction.PayeeId))
        {
            return true;
        }

        string? canonical = TextPreprocessor.Normalize(transaction.PayeeName);
        if (canonical != null && IsKeyAmbiguous(_canonicalPayeeVotes, canonical))
            return true;

        string? import = TextPreprocessor.Normalize(transaction.ImportPayeeNameOriginal);
        if (import == null)
            return false;

        string importAmountKey = ImportAmountKey(import, transaction.Amount);
        if (_importAmountVotes.TryGetDistribution(importAmountKey, out VoteDistribution bucketDist, out _)
            && bucketDist.TotalWeight >= _settings.MinSamples
            && IsDistributionAmbiguous(bucketDist))
        {
            return true;
        }

        return IsKeyAmbiguous(_importVotes, import);
    }

    public bool IsPayeeIdAmbiguous(string? payeeId) =>
        !string.IsNullOrWhiteSpace(payeeId) && IsKeyAmbiguous(_payeeIdVotes, payeeId);

    public bool IsCanonicalPayeeAmbiguous(string? payeeName)
    {
        string? canonical = TextPreprocessor.Normalize(payeeName);
        return canonical != null && IsKeyAmbiguous(_canonicalPayeeVotes, canonical);
    }

    public bool IsImportAmbiguous(string? importOriginal)
    {
        string? import = TextPreprocessor.Normalize(importOriginal);
        return import != null && IsKeyAmbiguous(_importVotes, import);
    }

    public bool IsImportAmountAmbiguous(string? importOriginal, int amountMilliunits)
    {
        string? import = TextPreprocessor.Normalize(importOriginal);
        if (import == null)
            return false;

        return IsKeyAmbiguous(_importAmountVotes, ImportAmountKey(import, amountMilliunits));
    }

    private bool IsKeyAmbiguous(MajorityVoteLookup lookup, string key)
    {
        if (!lookup.TryGetDistribution(key, out VoteDistribution distribution, out _))
            return false;

        if (distribution.TotalWeight < _settings.MinSamples)
            return false;

        return IsDistributionAmbiguous(distribution);
    }

    private bool IsDistributionAmbiguous(VoteDistribution distribution) =>
        distribution.DistinctLabels > 1
        && distribution.TopVoteShare < _settings.MinTopVoteShare;

    private int CountAmbiguous(MajorityVoteLookup lookup) =>
        lookup.Keys.Count(key => IsKeyAmbiguous(lookup, key));

    private static string ImportAmountKey(string normalizedImport, int amountMilliunits) =>
        $"{normalizedImport}|{AmountBucketing.Bucket(amountMilliunits)}";

    private static PendingTransaction ToPending(TrainingTransaction t) =>
        new(
            t.Id,
            t.ImportPayeeNameOriginal,
            t.ImportPayeeName,
            t.PayeeName,
            t.PayeeId,
            t.Amount,
            t.AccountName,
            t.Memo,
            t.Date);
}
