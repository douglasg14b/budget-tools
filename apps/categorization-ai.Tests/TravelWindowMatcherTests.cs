using YnabCategoryAi.Data;
using YnabCategoryAi.ML;
using YnabCategoryAi.ML.Travel;
using Xunit;

namespace YnabCategoryAi.Tests;

public sealed class TravelWindowMatcherTests
{
    [Fact]
    public void MatchesInclusiveDatesOnUnscopedWindow()
    {
        TravelWindowRecord window = Window("Hawaii", "vacation", "2026-07-01", "2026-07-10");
        PendingTransaction transaction = Pending(date: "2026-07-01", amount: -12000, accountId: "card-a");

        TravelWindowRecord? match = TravelWindowMatcher.Match(transaction, periodicMatch: null, [window]);

        Assert.NotNull(match);
        Assert.Equal(window.Id, match.Id);
    }

    [Fact]
    public void IgnoresCardScopedWindowOnADifferentAccount()
    {
        TravelWindowRecord window = Window("Hawaii", "vacation", "2026-07-01", "2026-07-10", ["card-a"]);
        PendingTransaction transaction = Pending(date: "2026-07-05", amount: -12000, accountId: "card-b");

        Assert.Null(TravelWindowMatcher.Match(transaction, periodicMatch: null, [window]));
    }

    [Fact]
    public void MatchesWhenTheAccountIsInTheWindowList()
    {
        TravelWindowRecord window = Window("Hawaii", "vacation", "2026-07-01", "2026-07-10", ["card-a", "card-c"]);
        PendingTransaction transaction = Pending(date: "2026-07-05", amount: -12000, accountId: "card-c");

        TravelWindowRecord? match = TravelWindowMatcher.Match(transaction, periodicMatch: null, [window]);

        Assert.NotNull(match);
        Assert.Equal(window.Id, match.Id);
    }

    [Fact]
    public void SkipsInflowsAndPeriodicMatches()
    {
        TravelWindowRecord window = Window("Hawaii", "vacation", "2026-07-01", "2026-07-10");
        PendingTransaction inflow = Pending(date: "2026-07-05", amount: 5000, accountId: "card-a");
        PendingTransaction periodic = Pending(date: "2026-07-05", amount: -12000, accountId: "card-a");

        Assert.Null(TravelWindowMatcher.Match(inflow, periodicMatch: null, [window]));
        Assert.Null(TravelWindowMatcher.Match(periodic, Periodic(), [window]));
    }

    [Fact]
    public void ThrowsWhenTwoWindowsMatchTheSameTransaction()
    {
        TravelWindowRecord first = Window("Hawaii", "vacation", "2026-07-01", "2026-07-10");
        TravelWindowRecord second = Window("Work trip", "work", "2026-07-08", "2026-07-12");
        PendingTransaction transaction = Pending(date: "2026-07-09", amount: -12000, accountId: "card-a");

        Assert.Throws<InvalidOperationException>(() =>
            TravelWindowMatcher.Match(transaction, periodicMatch: null, [first, second]));
    }

    private static TravelWindowRecord Window(
        string name,
        string kind,
        string start,
        string end,
        IReadOnlyList<string>? accountIds = null) =>
        new(Guid.NewGuid(), name, kind, DateOnly.Parse(start), DateOnly.Parse(end), Location: null, accountIds ?? []);

    private static PendingTransaction Pending(string date, int amount, string accountId) =>
        new(
            "tx-1",
            "SQ *COFFEE",
            "Coffee",
            "Coffee",
            "payee-1",
            amount,
            "Visa",
            null,
            DateOnly.Parse(date),
            accountId);

    private static PeriodicMatch Periodic() =>
        new()
        {
            Cadence = PeriodicCadence.Monthly,
            OccurrenceCount = 8,
            MedianAmount = -12000,
            LastDate = new DateOnly(2026, 6, 1),
            Category = "Streaming",
            CategoryVoteShare = 1,
            RelatedTransactionIds = ["tx-a"],
            CadenceFit = 1
        };
}
