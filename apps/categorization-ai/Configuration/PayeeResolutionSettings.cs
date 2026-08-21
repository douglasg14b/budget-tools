namespace YnabCategoryAi.Configuration;

public class PayeeResolutionSettings
{
    public float FuzzyMatchThreshold { get; set; } = 0.85f;

    public float FuzzyAmbiguityMargin { get; set; } = 0.05f;

    public int OversampleSingletonWeight { get; set; } = 5;

    public int OversampleDoubleWeight { get; set; } = 3;

    public int OversampleTripleWeight { get; set; } = 2;
}
