using YnabCategoryAi.Configuration;
using YnabCategoryAi.Data;
using YnabCategoryAi.ML;
using YnabCategoryAi.ML.Lookup;
using Xunit;

namespace YnabCategoryAi.Tests;

public sealed class PayeeLookupTests
{
    [Fact]
    public void ResolvesASeenImportStringToTheCanonicalPayee()
    {
        PayeeLookup lookup = Train(
            Tx("1", "SQ *STUMPTOWN COFFEE PORTLAND", "Stumptown"),
            Tx("2", "SQ *STUMPTOWN COFFEE PORTLAND", "Stumptown"),
            Tx("3", "NETFLIX.COM", "Netflix"));

        Assert.True(lookup.TryResolve(
            "SQ *STUMPTOWN COFFEE PORTLAND",
            "Sq *Stumptown Coffee Portland",
            minVoteShare: 0.8f,
            out LookupPrediction prediction,
            out string source));

        Assert.Equal("Stumptown", prediction.Label);
        Assert.Equal("import_original_lookup", source);
        Assert.True(prediction.Confidence >= 0.8f);
    }

    [Fact]
    public void DoesNotResolveANovelImportString()
    {
        PayeeLookup lookup = Train(Tx("1", "NETFLIX.COM", "Netflix"));

        Assert.False(lookup.TryResolve(
            "SQ *UNKNOWN CAFE SEATTLE",
            "Sq *Unknown Cafe Seattle",
            minVoteShare: 0.8f,
            out _,
            out _));
    }

    [Fact]
    public void RequiresVoteShareWhenTheSameImportMapsToMultiplePayees()
    {
        PayeeLookup lookup = Train(
            Tx("1", "AMZN MKTP", "Amazon"),
            Tx("2", "AMZN MKTP", "Amazon"),
            Tx("3", "AMZN MKTP", "Whole Foods"));

        Assert.False(lookup.TryResolve(
            "AMZN MKTP",
            "Amzn Mktp",
            minVoteShare: 0.85f,
            out _,
            out _));

        Assert.True(lookup.TryResolve(
            "AMZN MKTP",
            "Amzn Mktp",
            minVoteShare: 0.5f,
            out LookupPrediction prediction,
            out _));
        Assert.Equal("Amazon", prediction.Label);
    }

    private static PayeeLookup Train(params TrainingTransaction[] transactions)
    {
        var lookup = new PayeeLookup();
        lookup.Train(transactions, transactions.Max(t => t.Date), new AmbiguitySettings());
        return lookup;
    }

    private static TrainingTransaction Tx(string id, string import, string payee) =>
        new(
            id,
            import,
            import,
            payee,
            "payee-" + payee,
            "Groceries",
            "Needs",
            "cat-1",
            -12000,
            "Checking",
            null,
            new DateOnly(2024, 6, 1));
}
