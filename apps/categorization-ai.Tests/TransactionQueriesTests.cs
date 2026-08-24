using YnabCategoryAi.Data;
using YnabCategoryAi.Data.Entities;
using Xunit;

namespace YnabCategoryAi.Tests;

public sealed class TransactionQueriesTests
{
    [Theory]
    [InlineData("uncleared")]
    [InlineData("")]
    public void DoesNotQueueUnclearedTransactions(string cleared) =>
        Assert.False(TransactionQueries.IsPendingCategorization(Unapproved(cleared)));

    [Theory]
    [InlineData("cleared")]
    [InlineData("reconciled")]
    public void QueuesSettledUnapprovedTransactions(string cleared) =>
        Assert.True(TransactionQueries.IsPendingCategorization(Unapproved(cleared)));

    [Fact]
    public void DoesNotTrainOnUnclearedTransactionsEvenWhenCategorized()
    {
        Assert.False(TransactionQueries.IsTrainingEligible(Categorized("uncleared")));
        Assert.True(TransactionQueries.IsTrainingEligible(Categorized("cleared")));
        Assert.True(TransactionQueries.IsTrainingEligible(Categorized("reconciled")));
    }

    [Theory]
    [InlineData("cleared", true)]
    [InlineData("reconciled", true)]
    [InlineData("uncleared", false)]
    public void TreatsOnlyBankMatchedStatusesAsCleared(string cleared, bool expected) =>
        Assert.Equal(expected, TransactionQueries.IsCleared(Unapproved(cleared)));

    private static Transaction Unapproved(string cleared) => Tx(cleared, approved: false);

    private static Transaction Categorized(string cleared) =>
        Tx(cleared, approved: true, categoryId: "cat-groceries", categoryName: "Groceries");

    private static Transaction Tx(
        string cleared,
        bool approved,
        string? categoryId = null,
        string? categoryName = null) =>
        new()
        {
            Id = "tx-1",
            Date = new DateOnly(2026, 8, 1),
            Amount = -12000,
            Cleared = cleared,
            Approved = approved,
            AccountId = "acct-1",
            AccountName = "Checking",
            CategoryId = categoryId,
            CategoryName = categoryName,
            Deleted = false,
            Subtransactions = "[]",
        };
}
