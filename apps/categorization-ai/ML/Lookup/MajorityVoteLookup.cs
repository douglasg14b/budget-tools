namespace YnabCategoryAi.ML.Lookup;

public readonly record struct LookupPrediction(string Label, float Confidence, int SampleCount);

public readonly record struct VoteDistribution(float TopVoteShare, float TotalWeight, int DistinctLabels);

/// <summary>Majority-vote lookup table with confidence based on weighted vote share.</summary>
public sealed class MajorityVoteLookup
{
    private readonly Dictionary<string, Dictionary<string, float>> _weights = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, int> _sampleCounts = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// Pseudo-count k that shrinks predicted confidence by sample size: <c>share × n / (n + k)</c>,
    /// where n is the number of votes for the key. 0 reports the raw vote share.
    /// Raw distributions (<see cref="TryGetDistribution"/>) are never shrunk.
    /// </summary>
    public float SamplePrior { get; set; }

    public void Add(string key, string label, float weight = 1f)
    {
        if (string.IsNullOrWhiteSpace(key) || string.IsNullOrWhiteSpace(label) || weight <= 0)
            return;

        if (!_weights.TryGetValue(key, out Dictionary<string, float>? labelWeights))
        {
            labelWeights = new Dictionary<string, float>(StringComparer.OrdinalIgnoreCase);
            _weights[key] = labelWeights;
        }

        labelWeights[label] = labelWeights.GetValueOrDefault(label) + weight;
        _sampleCounts[key] = _sampleCounts.GetValueOrDefault(key) + 1;
    }

    public bool TryPredict(string key, float minVoteShare, out LookupPrediction prediction)
    {
        prediction = default;

        if (!TryGetDistribution(key, out VoteDistribution distribution, out string? topLabel))
            return false;

        int sampleCount = _sampleCounts.GetValueOrDefault(key);
        float confidence = SamplePrior > 0
            ? distribution.TopVoteShare * sampleCount / (sampleCount + SamplePrior)
            : distribution.TopVoteShare;

        if (confidence < minVoteShare || topLabel == null)
            return false;

        prediction = new LookupPrediction(topLabel, confidence, sampleCount);
        return true;
    }

    public bool TryGetDistribution(string key, out VoteDistribution distribution, out string? topLabel)
    {
        distribution = default;
        topLabel = null;

        if (string.IsNullOrWhiteSpace(key) || !_weights.TryGetValue(key, out Dictionary<string, float>? labelWeights))
            return false;

        if (labelWeights.Count == 0)
            return false;

        KeyValuePair<string, float> best = labelWeights.MaxBy(kvp => kvp.Value);
        float total = labelWeights.Values.Sum();
        if (total <= 0)
            return false;

        topLabel = best.Key;
        distribution = new VoteDistribution(best.Value / total, total, labelWeights.Count);
        return true;
    }

    public bool IsUnambiguous(string key) =>
        TryGetDistribution(key, out VoteDistribution distribution, out _)
        && distribution.DistinctLabels == 1;

    public int GetDistinctLabelCount(string key) =>
        string.IsNullOrWhiteSpace(key) || !_weights.TryGetValue(key, out Dictionary<string, float>? labelWeights)
            ? 0
            : labelWeights.Count;

    public int KeyCount => _weights.Count;

    public IEnumerable<string> Keys => _weights.Keys;

    public void Clear()
    {
        _weights.Clear();
        _sampleCounts.Clear();
    }
}
