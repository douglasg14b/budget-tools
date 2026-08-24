using System.Text.RegularExpressions;

namespace YnabCategoryAi.Data;

/// <summary>Canonical category names from the categories table (trim, collapse whitespace).</summary>
public static partial class CategoryNormalizer
{
    public const string InternalMasterGroupName = "Internal Master Category";

    private static readonly string[] ExcludedNamePrefixes = ["Inflow:"];

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
    /// </summary>
    public static bool IsExcludedName(string? categoryName)
    {
        if (string.IsNullOrWhiteSpace(categoryName))
            return true;

        if (string.Equals(categoryName, "Uncategorized", StringComparison.OrdinalIgnoreCase))
            return true;

        return ExcludedNamePrefixes.Any(prefix =>
            categoryName.StartsWith(prefix, StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>YNAB system group that holds Uncategorized and Ready to Assign.</summary>
    public static bool IsExcludedGroup(string? groupName) =>
        string.Equals(groupName, InternalMasterGroupName, StringComparison.OrdinalIgnoreCase);
}
