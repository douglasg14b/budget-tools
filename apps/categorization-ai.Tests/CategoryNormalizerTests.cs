using YnabCategoryAi.Data;
using Xunit;

namespace YnabCategoryAi.Tests;

public sealed class CategoryNormalizerTests
{
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("Uncategorized")]
    [InlineData("uncategorized")]
    [InlineData("Inflow: Ready to Assign")]
    [InlineData("inflow: Ready to Assign")]
    public void TreatsPlaceholderNamesAsExcluded(string? name) =>
        Assert.True(CategoryNormalizer.IsExcludedName(name));

    [Theory]
    [InlineData("Streaming")]
    [InlineData("Groceries")]
    [InlineData("Ready to Assign")]
    public void TreatsBudgetCategoryNamesAsAssignable(string name) =>
        Assert.False(CategoryNormalizer.IsExcludedName(name));

    [Fact]
    public void TreatsInternalMasterCategoryAsExcludedGroup()
    {
        Assert.True(CategoryNormalizer.IsExcludedGroup("Internal Master Category"));
        Assert.True(CategoryNormalizer.IsExcludedGroup("internal master category"));
        Assert.False(CategoryNormalizer.IsExcludedGroup("Monthly Bills"));
        Assert.False(CategoryNormalizer.IsExcludedGroup(null));
    }
}
