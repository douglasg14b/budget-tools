namespace YnabCategoryAi.ML;

public static class TemporalWeighting
{
    /// <summary>
    /// Exponential decay: weight 1.0 at reference date, 0.5 after one half-life, etc.
    /// </summary>
    public static float ComputeWeight(DateOnly transactionDate, DateOnly referenceDate, float halfLifeDays)
    {
        if (halfLifeDays <= 0)
            return 1f;

        int daysOld = referenceDate.DayNumber - transactionDate.DayNumber;
        if (daysOld <= 0)
            return 1f;

        return MathF.Pow(0.5f, daysOld / halfLifeDays);
    }
}
