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
    public void TreatsPlaceholderNamesAsExcluded(string? name) =>
        Assert.True(CategoryNormalizer.IsExcludedName(name));

    [Theory]
    [InlineData("Streaming")]
    [InlineData("Groceries")]
    [InlineData("Ready to Assign")]
    [InlineData("Inflow: Ready to Assign")]
    public void TreatsBudgetCategoryNamesAsAssignable(string name) =>
        Assert.False(CategoryNormalizer.IsExcludedName(name));

    [Theory]
    [InlineData("Inflow: Ready to Assign", "Internal Master Category", true)]
    [InlineData("inflow: Ready to Assign", "internal master category", true)]
    [InlineData("Uncategorized", "Internal Master Category", false)]
    [InlineData("Deferred Income SubCategory", "Internal Master Category", false)]
    [InlineData("Streaming", "Monthly Bills", true)]
    [InlineData("Uncategorized", "Monthly Bills", false)]
    public void AllowsReadyToAssignButNotOtherInternalPlaceholders(string name, string group, bool expected) =>
        Assert.Equal(expected, CategoryNormalizer.IsAssignable(name, group));

    [Fact]
    public void TreatsInternalMasterCategoryAsExcludedGroup()
    {
        Assert.True(CategoryNormalizer.IsExcludedGroup("Internal Master Category"));
        Assert.True(CategoryNormalizer.IsExcludedGroup("internal master category"));
        Assert.False(CategoryNormalizer.IsExcludedGroup("Monthly Bills"));
        Assert.False(CategoryNormalizer.IsExcludedGroup(null));
    }
}
