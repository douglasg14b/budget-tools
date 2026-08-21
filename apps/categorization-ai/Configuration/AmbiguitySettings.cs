namespace YnabCategoryAi.Configuration;

public class AmbiguitySettings
{
    /// <summary>Minimum weighted samples before a key can be marked ambiguous.</summary>
    public int MinSamples { get; set; } = 3;

    /// <summary>
    /// Keys with top-category vote share below this are ambiguous
    /// (e.g. 0.80 = need 80%+ agreement to treat as unambiguous).
    /// </summary>
    public float MinTopVoteShare { get; set; } = 0.80f;

    /// <summary>Half-life in days for temporal decay of training votes (recent labels weigh more).</summary>
    public float TemporalHalfLifeDays { get; set; } = 365f;
}
