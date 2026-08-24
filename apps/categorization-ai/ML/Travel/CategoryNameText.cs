using System.Globalization;
using System.Text;

namespace YnabCategoryAi.ML.Travel;

public static class CategoryNameText
{
    public static string CanonicalTail(string name)
    {
        string stripped = StripDecorations(name);
        string withoutVacation = StripLeadingVacation(stripped);
        return CollapseWhitespace(withoutVacation).ToLowerInvariant();
    }

    public static string CanonicalGroup(string groupName) =>
        CollapseWhitespace(StripDecorations(groupName)).ToLowerInvariant();

    public static bool IsVacationGroup(string groupName) =>
        CanonicalGroup(groupName) == "vacation";

    public static bool IsTripsSavingsCategory(string categoryName)
    {
        string canonical = CollapseWhitespace(StripDecorations(categoryName)).ToLowerInvariant();
        return canonical is "trips + vacations" or "trips and vacations";
    }

    public static bool TailsMatch(string left, string right) =>
        CanonicalTail(left) == CanonicalTail(right);

    public static string StripDecorations(string name)
    {
        var builder = new StringBuilder(name.Length);
        foreach (Rune rune in name.EnumerateRunes())
        {
            UnicodeCategory category = Rune.GetUnicodeCategory(rune);
            if (category is UnicodeCategory.OtherSymbol
                or UnicodeCategory.ModifierSymbol
                or UnicodeCategory.NonSpacingMark
                or UnicodeCategory.Format
                or UnicodeCategory.Surrogate
                or UnicodeCategory.PrivateUse
                or UnicodeCategory.OtherNotAssigned)
            {
                continue;
            }

            builder.Append(rune.ToString());
        }

        return builder.ToString();
    }

    private static string StripLeadingVacation(string name)
    {
        string trimmed = name.Trim();
        if (trimmed.StartsWith("Vacation", StringComparison.OrdinalIgnoreCase))
        {
            string rest = trimmed["Vacation".Length..].TrimStart(' ', '-', '–', ':', '—');
            return rest.Length > 0 ? rest : trimmed;
        }

        return trimmed;
    }

    private static string CollapseWhitespace(string value) =>
        string.Join(' ', value.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
}
