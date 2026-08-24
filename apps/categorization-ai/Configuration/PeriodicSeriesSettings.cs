namespace YnabCategoryAi.Configuration;

public class PeriodicSeriesSettings
{
    public int MinOccurrences { get; set; } = 3;

    public float CadenceMatchRatio { get; set; } = 0.70f;

    public float AmountRelativeTolerance { get; set; } = 0.08f;

    public int AmountAbsoluteToleranceMilliunits { get; set; } = 1000;

    public float StableCategoryVoteShare { get; set; } = 0.85f;

    public int MaxMissedPeriods { get; set; } = 2;

    public int RelatedTransactionIdCap { get; set; } = 8;
}
