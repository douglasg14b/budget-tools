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

public sealed class PeriodicSeriesListItem
{
    public required string Id { get; init; }
    public required string PayeeName { get; init; }
    public required PeriodicCadence Cadence { get; init; }
    public required int OccurrenceCount { get; init; }
    public required int MedianAmount { get; init; }
    public required DateOnly LastDate { get; init; }
    public required DateOnly ExpectedNextDate { get; init; }
    public string? Category { get; init; }
    public required float CategoryVoteShare { get; init; }
    public required bool CategoryStable { get; init; }
    public required float CadenceFit { get; init; }
    public IReadOnlyList<string> RelatedTransactionIds { get; init; } = [];
}

public sealed class PeriodicSeriesListPayload
{
    public required IReadOnlyList<PeriodicSeriesListItem> Series { get; init; }
}
