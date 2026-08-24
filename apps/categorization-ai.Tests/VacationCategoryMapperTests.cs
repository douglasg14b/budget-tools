using YnabCategoryAi.Data;
using YnabCategoryAi.ML.Travel;
using Xunit;

namespace YnabCategoryAi.Tests;

public sealed class VacationCategoryMapperTests
{
    [Fact]
    public void MapsCoffeeToVacationCoffeeWhenThatCategoryExists()
    {
        CategoryCatalog catalog = Catalog();

        CategoryInfo? mapped = VacationCategoryMapper.MapVacation("Coffee", catalog);

        Assert.NotNull(mapped);
        Assert.Equal("vacation-coffee", mapped.Id);
        Assert.Equal("🌴☕ Vacation - Coffee", mapped.Name);
    }

    [Fact]
    public void MapsGroceriesToVacationFoodViaSynonym()
    {
        CategoryCatalog catalog = Catalog();

        CategoryInfo? mapped = VacationCategoryMapper.MapVacation("Groceries", catalog);

        Assert.NotNull(mapped);
        Assert.Equal("vacation-food", mapped.Id);
    }

    [Fact]
    public void KeepsOriginalWhenNoVacationCounterpartExists()
    {
        CategoryCatalog catalog = Catalog();

        Assert.Null(VacationCategoryMapper.MapVacation("Pharmacy", catalog));
    }

    [Fact]
    public void DoesNotMapTheTripsSavingsCategory()
    {
        CategoryCatalog catalog = Catalog();

        CategoryInfo? mapped = VacationCategoryMapper.MapVacation("✈️ Trips + Vacations", catalog);

        Assert.Null(mapped);
    }

    [Fact]
    public void ReturnsTheWinnerWhenItIsAlreadyInTheVacationGroup()
    {
        CategoryCatalog catalog = Catalog();

        CategoryInfo? mapped = VacationCategoryMapper.MapVacation("🌴☕ Vacation - Coffee", catalog);

        Assert.NotNull(mapped);
        Assert.Equal("vacation-coffee", mapped.Id);
    }

    [Fact]
    public void MapWorkResolvesTransientReimbursable()
    {
        CategoryCatalog catalog = Catalog();

        CategoryInfo mapped = VacationCategoryMapper.MapWork(catalog);

        Assert.Equal("transient", mapped.Id);
    }

    [Fact]
    public void MapWorkFailsLoudlyWhenTransientIsMissing()
    {
        CategoryCatalog catalog = CategoryCatalog.FromCategories(
        [
            Category("coffee", "Coffee", "home", "Everyday"),
        ]);

        Assert.Throws<InvalidOperationException>(() => VacationCategoryMapper.MapWork(catalog));
    }

    internal static CategoryCatalog Catalog() =>
        CategoryCatalog.FromCategories(
        [
            Category("coffee", "Coffee", "home", "Everyday"),
            Category("groceries", "Groceries", "home", "Everyday"),
            Category("dining", "Dining", "home", "Everyday"),
            Category("pharmacy", "Pharmacy", "home", "Everyday"),
            Category("transient", "🔄 Transient / Reimbursable", "flex", "Flex"),
            Category("vacation-coffee", "🌴☕ Vacation - Coffee", "vac", "Vacation"),
            Category("vacation-food", "Vacation - Food", "vac", "Vacation"),
            Category("trips-savings", "✈️ Trips + Vacations", "vac", "Vacation"),
        ]);

    private static CategoryInfo Category(string id, string name, string groupId, string groupName) =>
        new()
        {
            Id = id,
            Name = name,
            GroupId = groupId,
            GroupName = groupName
        };
}
