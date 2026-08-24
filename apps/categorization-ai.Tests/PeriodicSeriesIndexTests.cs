using YnabCategoryAi.Configuration;
using YnabCategoryAi.Data;
using YnabCategoryAi.ML;
using Xunit;

namespace YnabCategoryAi.Tests;

using static PeriodicTestData;

public sealed class PeriodicSeriesIndexTests
{
    private static readonly PeriodicSeriesSettings Settings = new();

    [Fact]
    public void DetectsMonthlySeriesAndMatchesNextOccurrence()
    {
        PeriodicSeriesIndex index = Train(Monthly("Netflix", "Streaming", count: 6, lastMonth: 6));

        PeriodicMatch? match = index.TryMatch(Pending(
            "pending-1",
            new DateOnly(2024, 7, 15),
            amount: -14990));

        Assert.NotNull(match);
        Assert.Equal(PeriodicCadence.Monthly, match.Cadence);
        Assert.Equal(6, match.OccurrenceCount);
        Assert.Equal("Streaming", match.Category);
        Assert.Equal(1f, match.CategoryVoteShare);
        Assert.Equal(new DateOnly(2024, 6, 15), match.LastDate);
        Assert.Equal(-14990, match.MedianAmount);
        Assert.Equal(6, match.RelatedTransactionIds.Count);
        Assert.Equal("netflix-6", match.RelatedTransactionIds[0]);
    }

    [Fact]
    public void MatchesPendingAfterAMissedMonth()
    {
        PeriodicSeriesIndex index = Train(Monthly("Netflix", "Streaming", count: 6, lastMonth: 6));

        PeriodicMatch? match = index.TryMatch(Pending(
            "pending-missed",
            new DateOnly(2024, 8, 15),
            amount: -14990));

        Assert.NotNull(match);
        Assert.Equal(PeriodicCadence.Monthly, match.Cadence);
    }

    [Fact]
    public void DetectsWeeklySeries()
    {
        var history = new List<TrainingTransaction>();
        DateOnly start = new(2024, 1, 4);
        for (int week = 0; week < 6; week++)
        {
            history.Add(Training(
                $"grocery-{week}",
                start.AddDays(week * 7),
                amount: -85000,
                category: "Groceries"));
        }

        PeriodicSeriesIndex index = Train(history);
        PeriodicMatch? match = index.TryMatch(Pending(
            "pending-weekly",
            start.AddDays(6 * 7),
            amount: -85000));

        Assert.NotNull(match);
        Assert.Equal(PeriodicCadence.Weekly, match.Cadence);
        Assert.Equal(6, match.OccurrenceCount);
    }

    [Fact]
    public void RejectsDifferentAmount()
    {
        PeriodicSeriesIndex index = Train(Monthly("Netflix", "Streaming", count: 6, lastMonth: 6));

        PeriodicMatch? match = index.TryMatch(Pending(
            "pending-amount",
            new DateOnly(2024, 7, 15),
            amount: -80000));

        Assert.Null(match);
    }

    [Fact]
    public void RejectsOppositeSign()
    {
        PeriodicSeriesIndex index = Train(Monthly("Netflix", "Streaming", count: 6, lastMonth: 6));

        PeriodicMatch? match = index.TryMatch(Pending(
            "pending-inflow",
            new DateOnly(2024, 7, 15),
            amount: 14990));

        Assert.Null(match);
    }

    [Fact]
    public void TagsMixedCategorySeriesWithoutTreatingItAsStable()
    {
        var history = new List<TrainingTransaction>();
        for (int month = 1; month <= 6; month++)
        {
            string category = month <= 3 ? "Streaming" : "Entertainment";
            history.Add(Training(
                $"netflix-{month}",
                new DateOnly(2024, month, 15),
                amount: -14990,
                category: category));
        }

        PeriodicSeriesIndex index = Train(history);
        PeriodicMatch? match = index.TryMatch(Pending(
            "pending-mixed",
            new DateOnly(2024, 7, 15),
            amount: -14990));

        Assert.NotNull(match);
        Assert.Equal(0.5f, match.CategoryVoteShare);
        Assert.False(PeriodicScoring.IsStable(match, Settings));
        Assert.False(PeriodicScoring.TryCreateSignal(match, Settings, out _));
    }

    [Fact]
    public void IgnoresFewerThanThreeOccurrences()
    {
        List<TrainingTransaction> history = Monthly("Netflix", "Streaming", count: 2, lastMonth: 2);
        PeriodicSeriesIndex index = Train(history);

        Assert.Equal(0, index.SeriesCount);
        Assert.Null(index.TryMatch(Pending("pending-few", new DateOnly(2024, 3, 15), amount: -14990)));
    }

    [Fact]
    public void DropsASeriesThatWentQuiet()
    {
        PeriodicSeriesIndex index = Train(Monthly("Netflix", "Streaming", count: 6, lastMonth: 6));

        PeriodicMatch? match = index.TryMatch(Pending(
            "pending-quiet",
            new DateOnly(2024, 12, 15),
            amount: -14990));

        Assert.Null(match);
    }

    [Fact]
    public void MatchesPendingWhenApprovedHistoryHasABacklogAndPriceChange()
    {
        PeriodicHistoryTransaction[] history =
        [
            History("old-1", new DateOnly(2024, 1, 19), -7990, "Streaming"),
            History("old-2", new DateOnly(2024, 2, 20), -7990, "Streaming"),
            History("old-3", new DateOnly(2024, 3, 20), -7990, "Streaming"),
            History("new-1", new DateOnly(2026, 3, 19), -9990, "Streaming"),
            History("new-2", new DateOnly(2026, 4, 20), -9990, "Streaming"),
            History("new-3", new DateOnly(2026, 5, 19), -9990, "Streaming"),
            History("new-4", new DateOnly(2026, 6, 22), -9990, "Streaming"),
            History("new-5", new DateOnly(2026, 7, 20), -9990, "Streaming"),
            History("pending", new DateOnly(2026, 8, 19), -9990, category: null)
        ];

        var index = new PeriodicSeriesIndex();
        index.Train(history, Settings);

        PeriodicMatch? match = index.TryMatch(Pending(
            "pending",
            new DateOnly(2026, 8, 19),
            amount: -9990));

        Assert.NotNull(match);
        Assert.Equal(PeriodicCadence.Monthly, match.Cadence);
        Assert.Equal("Streaming", match.Category);
        Assert.Equal(new DateOnly(2026, 7, 20), match.LastDate);
        Assert.True(match.OccurrenceCount >= 6);
    }

    [Fact]
    public void DetectsCadenceWithoutSuggestingUncategorized()
    {
        PeriodicHistoryTransaction[] history =
        [
            History("tv-1", new DateOnly(2026, 3, 17), -14990, "Uncategorized"),
            History("tv-2", new DateOnly(2026, 4, 17), -14990, "Uncategorized"),
            History("tv-3", new DateOnly(2026, 5, 17), -14990, "Uncategorized"),
            History("tv-4", new DateOnly(2026, 6, 17), -14990, "Uncategorized"),
            History("tv-5", new DateOnly(2026, 7, 17), -14990, "Uncategorized"),
            History("pending", new DateOnly(2026, 8, 17), -14990, category: "Uncategorized")
        ];

        var index = new PeriodicSeriesIndex();
        index.Train(history, Settings);

        PeriodicMatch? match = index.TryMatch(Pending(
            "pending",
            new DateOnly(2026, 8, 17),
            amount: -14990,
            payeeName: "Netflix"));

        Assert.NotNull(match);
        Assert.Equal(PeriodicCadence.Monthly, match.Cadence);
        Assert.Null(match.Category);
        Assert.Equal(0f, match.CategoryVoteShare);
        Assert.False(PeriodicScoring.IsStable(match, Settings));
        Assert.False(PeriodicScoring.TryCreateSignal(match, Settings, out _));
    }

    [Fact]
    public void IgnoresUncategorizedVotesWhenSomeOccurrencesAreLabeled()
    {
        PeriodicHistoryTransaction[] history =
        [
            History("tv-1", new DateOnly(2026, 3, 17), -14990, "Streaming"),
            History("tv-2", new DateOnly(2026, 4, 17), -14990, "Streaming"),
            History("tv-3", new DateOnly(2026, 5, 17), -14990, "Streaming"),
            History("tv-4", new DateOnly(2026, 6, 17), -14990, "Uncategorized"),
            History("tv-5", new DateOnly(2026, 7, 17), -14990, "Uncategorized"),
            History("pending", new DateOnly(2026, 8, 17), -14990, category: "Uncategorized")
        ];

        var index = new PeriodicSeriesIndex();
        index.Train(history, Settings);

        PeriodicMatch? match = index.TryMatch(Pending(
            "pending",
            new DateOnly(2026, 8, 17),
            amount: -14990));

        Assert.NotNull(match);
        Assert.Equal("Streaming", match.Category);
        Assert.Equal(1f, match.CategoryVoteShare);
        Assert.True(PeriodicScoring.TryCreateSignal(match, Settings, out MethodSignal signal));
        Assert.Equal("Streaming", signal.Category);
    }
}

public sealed class PeriodicScoringTests
{
    private static readonly PeriodicSeriesSettings PeriodicSettings = new();
    private static readonly ConsensusSettings ConsensusSettings = new()
    {
        EligibleMethods =
        [
            CategorizationMethod.ImportAmountLookup,
            CategorizationMethod.HierarchicalModel,
            CategorizationMethod.CategoryModel,
            CategorizationMethod.PeriodicSeriesLookup
        ]
    };

    [Fact]
    public void EmitsSignalForStableSeries()
    {
        PeriodicMatch match = StableMatch("Streaming");

        Assert.True(PeriodicScoring.TryCreateSignal(match, PeriodicSettings, out MethodSignal signal));
        Assert.Equal(CategorizationMethod.PeriodicSeriesLookup, signal.Method);
        Assert.Equal("Streaming", signal.Category);
        Assert.Equal(1f, signal.Confidence);
    }

    [Fact]
    public void DetectsConflictWhenEligibleSignalDisagrees()
    {
        PeriodicMatch match = StableMatch("Streaming");
        MethodSignal[] signals =
        [
            new(CategorizationMethod.PeriodicSeriesLookup, "Streaming", 1f),
            new(CategorizationMethod.HierarchicalModel, "Groceries", 0.95f)
        ];

        Assert.True(PeriodicScoring.IsConflict(
            match,
            consensusCategory: "Groceries",
            signals,
            ConsensusSettings,
            PeriodicSettings));
    }

    [Fact]
    public void DoesNotEmitSignalForUncategorized()
    {
        PeriodicMatch match = StableMatch("Uncategorized");

        Assert.False(PeriodicScoring.IsStable(match, PeriodicSettings));
        Assert.False(PeriodicScoring.TryCreateSignal(match, PeriodicSettings, out _));
    }

    [Fact]
    public void DoesNotConflictWhenOtherSignalsAgree()
    {
        PeriodicMatch match = StableMatch("Streaming");
        MethodSignal[] signals =
        [
            new(CategorizationMethod.PeriodicSeriesLookup, "Streaming", 1f),
            new(CategorizationMethod.HierarchicalModel, "Streaming", 0.95f),
            new(CategorizationMethod.CategoryModel, "Streaming", 0.92f)
        ];

        Assert.False(PeriodicScoring.IsConflict(
            match,
            consensusCategory: "Streaming",
            signals,
            ConsensusSettings,
            PeriodicSettings));
    }

    private static PeriodicMatch StableMatch(string category) =>
        new()
        {
            Cadence = PeriodicCadence.Monthly,
            OccurrenceCount = 6,
            MedianAmount = -14990,
            LastDate = new DateOnly(2024, 6, 15),
            Category = category,
            CategoryVoteShare = 1f,
            RelatedTransactionIds = ["a", "b"],
            CadenceFit = 1f
        };
}

file static class PeriodicTestData
{
    public static PeriodicSeriesIndex Train(IReadOnlyList<TrainingTransaction> transactions)
    {
        var index = new PeriodicSeriesIndex();
        index.Train(transactions, new PeriodicSeriesSettings());
        return index;
    }

    public static List<TrainingTransaction> Monthly(
        string payeeName,
        string category,
        int count,
        int lastMonth)
    {
        var history = new List<TrainingTransaction>();
        int firstMonth = lastMonth - count + 1;
        for (int month = firstMonth; month <= lastMonth; month++)
        {
            history.Add(Training(
                $"{payeeName.ToLowerInvariant()}-{month}",
                new DateOnly(2024, month, 15),
                amount: -14990,
                category: category,
                payeeName: payeeName));
        }

        return history;
    }

    public static PeriodicHistoryTransaction History(
        string id,
        DateOnly date,
        int amount,
        string? category,
        string? payeeId = "payee-1",
        string? payeeName = "Netflix",
        string? import = "NETFLIX.COM") =>
        new(id, import, payeeName, payeeId, category, amount, date);

    public static TrainingTransaction Training(
        string id,
        DateOnly date,
        int amount,
        string category,
        string? payeeId = "payee-1",
        string? payeeName = "Netflix",
        string? import = "NETFLIX.COM") =>
        new(
            id,
            import,
            import,
            payeeName,
            payeeId,
            category,
            "Monthly Bills",
            "cat-1",
            amount,
            "Checking",
            null,
            date);

    public static PendingTransaction Pending(
        string id,
        DateOnly date,
        int amount,
        string? payeeId = "payee-1",
        string? payeeName = "Netflix",
        string? import = "NETFLIX.COM") =>
        new(id, import, import, payeeName, payeeId, amount, "Checking", null, date);
}
