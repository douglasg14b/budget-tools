using YnabCategoryAi.Configuration;
using YnabCategoryAi.Data;
using YnabCategoryAi.ML;
using YnabCategoryAi.ML.Lookup;
using Xunit;

namespace YnabCategoryAi.Tests;

public sealed class PayeeClusterIndexTests
{
    [Fact]
    public void ResolvesANovelStoreNumberToTheSameCanonicalPayee()
    {
        var index = new PayeeClusterIndex();
        index.Train(
        [
            Tx("1", "STARBUCKS STORE 12345 SEATTLE WA", "Starbucks"),
            Tx("2", "STARBUCKS STORE 12345 SEATTLE WA", "Starbucks"),
            Tx("3", "NETFLIX.COM", "Netflix")
        ]);

        Assert.True(index.TryResolve(
            "STARBUCKS STORE 99881 SEATTLE WA",
            "Starbucks Store 99881 Seattle Wa",
            new PayeeResolutionSettings(),
            new AmbiguousMerchantIndex(),
            out LookupPrediction prediction));

        Assert.Equal("Starbucks", prediction.Label);
        Assert.True(prediction.Confidence >= 0.85f);
    }

    [Fact]
    public void DoesNotResolveAnUnrelatedImportString()
    {
        var index = new PayeeClusterIndex();
        index.Train(
        [
            Tx("1", "STARBUCKS STORE 12345 SEATTLE WA", "Starbucks"),
            Tx("2", "NETFLIX.COM", "Netflix")
        ]);

        Assert.False(index.TryResolve(
            "SHELL OIL 77821",
            "Shell Oil 77821",
            new PayeeResolutionSettings(),
            new AmbiguousMerchantIndex(),
            out _));
    }

    private static TrainingTransaction Tx(string id, string import, string payee) =>
        new(
            id,
            import,
            import,
            payee,
            "payee-" + payee,
            "Dining",
            "Wants",
            "cat-1",
            -6500,
            "Checking",
            null,
            new DateOnly(2024, 6, 1));
}
