using System.Text.Json.Serialization;

namespace YnabCategoryAi.ML;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum PeriodicCadence
{
    Weekly,
    Biweekly,
    Monthly,
    Quarterly,
    Yearly
}

public sealed class PeriodicMatch
{
    public required PeriodicCadence Cadence { get; init; }
    public required int OccurrenceCount { get; init; }
    public required int MedianAmount { get; init; }
    public required DateOnly LastDate { get; init; }
    public string? Category { get; init; }
    public required float CategoryVoteShare { get; init; }
    public IReadOnlyList<string> RelatedTransactionIds { get; init; } = [];
    public float CadenceFit { get; init; }
}
