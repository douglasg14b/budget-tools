using System.Text.RegularExpressions;

namespace YnabCategoryAi.Data;

/// <summary>Canonical category names from the categories table (trim, collapse whitespace).</summary>
public static partial class CategoryNormalizer
{
    public const string InternalMasterGroupName = "Internal Master Category";

    [GeneratedRegex(@"\s+")]
    private static partial Regex WhitespaceRegex();

    public static string? Normalize(string? name)
    {
        if (string.IsNullOrWhiteSpace(name))
            return null;

        return WhitespaceRegex().Replace(name.Trim(), " ");
    }

    public static bool AreEquivalent(string? left, string? right) =>
        string.Equals(Normalize(left), Normalize(right), StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// YNAB placeholder names that mean "not categorized" — never train on or suggest these.
    /// Ready to Assign is a real income category, not a placeholder.
    /// </summary>
    public static bool IsExcludedName(string? categoryName) =>
        string.IsNullOrWhiteSpace(categoryName)
        || string.Equals(categoryName.Trim(), "Uncategorized", StringComparison.OrdinalIgnoreCase);

    /// <summary>YNAB's income category ("Inflow: Ready to Assign").</summary>
    public static bool IsReadyToAssign(string? categoryName) =>
        categoryName != null && categoryName.Trim().StartsWith("Inflow:", StringComparison.OrdinalIgnoreCase);

    /// <summary>YNAB system group that holds Uncategorized and Ready to Assign.</summary>
    public static bool IsExcludedGroup(string? groupName) =>
        string.Equals(groupName, InternalMasterGroupName, StringComparison.OrdinalIgnoreCase);

    /// <summary>Not a placeholder name, and not in Internal Master Category unless it is Ready to Assign.</summary>
    public static bool IsAssignable(string? categoryName, string? groupName) =>
        !IsExcludedName(categoryName) && (IsReadyToAssign(categoryName) || !IsExcludedGroup(groupName));
}
