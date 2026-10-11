using YnabCategoryAi.ML;
using Xunit;

namespace YnabCategoryAi.Tests;

public sealed class ImportStringAugmenterTests
{
    [Fact]
    public void FlagsWordDroppingVariantsAsTruncated()
    {
        var variants = ImportStringAugmenter.AugmentDetailed("The Local Station")
            .ToDictionary(v => v.Import, v => v.IsTruncated);

        Assert.False(variants["the local station"]);
        Assert.True(variants["the local"]);
    }

    [Fact]
    public void KeepsLocationAndPrefixStripsExactSafe()
    {
        var variants = ImportStringAugmenter.AugmentDetailed("SQ *STUMPTOWN COFFEE PORTLAND OR")
            .ToDictionary(v => v.Import, v => v.IsTruncated);

        Assert.False(variants["stumptown coffee portland or"]);
        Assert.False(variants["stumptown coffee portland"]);
    }
}
