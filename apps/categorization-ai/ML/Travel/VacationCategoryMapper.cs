using YnabCategoryAi.Data;

namespace YnabCategoryAi.ML.Travel;

public static class VacationCategoryMapper
{
    private static readonly Dictionary<string, string> TailSynonyms = new(StringComparer.OrdinalIgnoreCase)
    {
        ["groceries"] = "food",
        ["grocery"] = "food",
        ["restaurants"] = "food",
        ["restaurant"] = "food",
        ["dining"] = "food",
        ["uber"] = "transportation",
        ["lyft"] = "transportation",
        ["parking"] = "transportation",
        ["taxi"] = "transportation",
        ["transit"] = "transportation",
        ["hotel"] = "lodging",
        ["lodging"] = "lodging",
        ["airbnb"] = "lodging",
        ["airfare"] = "lodging",
        ["flight"] = "lodging",
    };

    public const string WorkCategoryTail = "transient / reimbursable";

    public static CategoryInfo MapWork(CategoryCatalog catalog)
    {
        foreach (CategoryInfo category in catalog.AllCategories)
        {
            if (CategoryNameText.CanonicalTail(category.Name) == WorkCategoryTail)
                return category;
        }

        throw new InvalidOperationException(
            "Work travel bias requires a 'Transient / Reimbursable' category in the YNAB catalog.");
    }

    public static CategoryInfo? MapVacation(string winnerCategory, CategoryCatalog catalog)
    {
        IReadOnlyList<CategoryInfo> vacationCategories = VacationCategories(catalog);
        if (vacationCategories.Count == 0)
            return null;

        if (catalog.TryResolveCategory(winnerCategory, out CategoryInfo winner)
            && CategoryNameText.IsVacationGroup(winner.GroupName)
            && !CategoryNameText.IsTripsSavingsCategory(winner.Name))
        {
            return winner;
        }

        string winnerTail = CategoryNameText.CanonicalTail(winnerCategory);
        CategoryInfo? exact = FindByTail(vacationCategories, winnerTail);
        if (exact != null)
            return exact;

        if (TailSynonyms.TryGetValue(winnerTail, out string? synonym))
            return FindByTail(vacationCategories, synonym);

        return null;
    }

    private static CategoryInfo? FindByTail(IReadOnlyList<CategoryInfo> categories, string tail)
    {
        foreach (CategoryInfo category in categories)
        {
            if (CategoryNameText.CanonicalTail(category.Name) == tail)
                return category;
        }

        return null;
    }

    private static IReadOnlyList<CategoryInfo> VacationCategories(CategoryCatalog catalog)
    {
        var matched = new List<CategoryInfo>();
        foreach (string groupName in catalog.AllGroupNames)
        {
            if (!CategoryNameText.IsVacationGroup(groupName))
                continue;

            foreach (CategoryInfo category in catalog.GetCategoriesInGroup(groupName))
            {
                if (!CategoryNameText.IsTripsSavingsCategory(category.Name))
                    matched.Add(category);
            }
        }

        return matched;
    }
}
