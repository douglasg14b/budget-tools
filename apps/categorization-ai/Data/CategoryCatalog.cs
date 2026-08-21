using Microsoft.EntityFrameworkCore;
using YnabCategoryAi.Data.Entities;
using YnabCategoryAi.ML;

namespace YnabCategoryAi.Data;

public sealed class CategoryInfo
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public required string GroupId { get; init; }
    public required string GroupName { get; init; }
}

/// <summary>All assignable YNAB categories plus training coverage stats.</summary>
public sealed class CategoryCatalog
{
    private readonly Dictionary<string, CategoryInfo> _byName = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, List<CategoryInfo>> _byGroup = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, int> _categoryTrainingCounts = new(StringComparer.OrdinalIgnoreCase);
    private readonly HashSet<string> _seenImportStrings = new(StringComparer.OrdinalIgnoreCase);

    public int MinTrainingExamplesForLocalMl { get; init; } = 5;

    public static CategoryCatalog Load(BudgetToolsContext db, int minTrainingExamplesForLocalMl = 5)
    {
        var catalog = new CategoryCatalog { MinTrainingExamplesForLocalMl = minTrainingExamplesForLocalMl };

        List<Category> categories = db.Categories
            .Include(c => c.Group)
            .Where(c => !c.Hidden && !c.Deleted)
            .ToList();

        foreach (Category c in categories)
        {
            string name = CategoryNormalizer.Normalize(c.Name)!;
            string groupName = CategoryNormalizer.Normalize(c.Group.Name)!;

            var info = new CategoryInfo
            {
                Id = c.Id,
                Name = name,
                GroupId = c.CategoryGroupId,
                GroupName = groupName
            };

            catalog._byName[name] = info;

            if (!catalog._byGroup.TryGetValue(groupName, out List<CategoryInfo>? groupList))
            {
                groupList = [];
                catalog._byGroup[groupName] = groupList;
            }

            groupList.Add(info);
        }

        return catalog;
    }

    public void IndexTrainingData(IEnumerable<TrainingTransaction> transactions)
    {
        foreach (TrainingTransaction t in transactions)
        {
            _categoryTrainingCounts[t.CategoryName] =
                _categoryTrainingCounts.GetValueOrDefault(t.CategoryName) + 1;

            string? import = TextPreprocessor.Normalize(t.ImportPayeeNameOriginal);
            if (import != null)
                _seenImportStrings.Add(import);
        }
    }

    public IReadOnlyList<CategoryInfo> AllCategories => _byName.Values.ToList();

    public IReadOnlyList<string> AllGroupNames => _byGroup.Keys.OrderBy(x => x).ToList();

    public bool TryGetCategory(string name, out CategoryInfo info) =>
        _byName.TryGetValue(name, out info!);

    public IReadOnlyList<CategoryInfo> GetCategoriesInGroup(string groupName) =>
        _byGroup.TryGetValue(groupName, out List<CategoryInfo>? list) ? list : [];

    public bool CategoryBelongsToGroup(string categoryName, string groupName)
    {
        if (!_byName.TryGetValue(categoryName, out CategoryInfo? info))
            return false;

        return string.Equals(info.GroupName, groupName, StringComparison.OrdinalIgnoreCase);
    }

    public int GetTrainingCount(string categoryName) =>
        _categoryTrainingCounts.GetValueOrDefault(categoryName);

    public bool IsLocallyTrainable(string categoryName) =>
        GetTrainingCount(categoryName) >= MinTrainingExamplesForLocalMl;

    public bool HasNeverBeenClassified(string categoryName) =>
        GetTrainingCount(categoryName) == 0;

    public IReadOnlyList<CategoryInfo> GetUntrainedCategories() =>
        _byName.Values.Where(c => HasNeverBeenClassified(c.Name)).ToList();

    public IReadOnlyList<CategoryInfo> GetUndertrainedCategories() =>
        _byName.Values.Where(c => !IsLocallyTrainable(c.Name)).ToList();

    public bool HasSeenImportString(string? importOriginal)
    {
        string? normalized = TextPreprocessor.Normalize(importOriginal);
        return normalized != null && _seenImportStrings.Contains(normalized);
    }

    public bool IsValidAssignableCategory(string? categoryName)
    {
        string? normalized = CategoryNormalizer.Normalize(categoryName);
        return normalized != null && _byName.ContainsKey(normalized);
    }

    public bool TryResolveCategory(string? categoryName, out CategoryInfo info)
    {
        string? normalized = CategoryNormalizer.Normalize(categoryName);
        if (normalized != null && _byName.TryGetValue(normalized, out info!))
            return true;

        info = null!;
        return false;
    }
}
