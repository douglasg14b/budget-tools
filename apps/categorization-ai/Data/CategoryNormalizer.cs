using System.Text.RegularExpressions;

namespace YnabCategoryAi.Data;

/// <summary>Canonical category names from the categories table (trim, collapse whitespace).</summary>
public static partial class CategoryNormalizer
{
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
}
