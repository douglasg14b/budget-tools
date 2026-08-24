namespace YnabCategoryAi.ML;

/// <summary>
/// Detects when the current YNAB payee is still a bank import string, so a canonical
/// payee suggestion is a rename rather than an overwrite of an already-cleaned name.
/// </summary>
public static class PayeeRename
{
    public const double RawPayeeSimilarityThreshold = 0.85;

    public static bool NeedsRename(
        string? currentPayee,
        string? suggestedPayee,
        string? importOriginal,
        string? importPayee)
    {
        if (string.IsNullOrWhiteSpace(suggestedPayee))
            return false;

        if (IsSamePayee(currentPayee, suggestedPayee))
            return false;

        string? bankText = FirstNonEmpty(importOriginal, importPayee);
        if (!LooksLikeImportName(currentPayee, bankText, importPayee: null))
            return false;

        // Historical payee_name is sometimes still the bank string. Never "rename" toward it.
        return !IsDirtierThanCurrent(suggestedPayee, currentPayee, bankText);
    }

    public static bool IsSamePayee(string? left, string? right)
    {
        if (string.IsNullOrWhiteSpace(left) || string.IsNullOrWhiteSpace(right))
            return false;

        if (string.Equals(left.Trim(), right.Trim(), StringComparison.OrdinalIgnoreCase))
            return true;

        string? normalizedLeft = TextPreprocessor.Normalize(left);
        string? normalizedRight = TextPreprocessor.Normalize(right);
        return normalizedLeft != null
            && normalizedRight != null
            && string.Equals(normalizedLeft, normalizedRight, StringComparison.Ordinal);
    }

    public static bool LooksLikeImportName(string? payeeName, string? importOriginal, string? importPayee)
    {
        string? payee = TextPreprocessor.Normalize(payeeName);
        if (payee == null)
            return true;

        // Prefer the raw bank string. Matching YNAB's cleaned import_payee_name falsely
        // treats an already-short payee ("Proton Ag") as raw.
        string? bankText = FirstNonEmpty(importOriginal, importPayee);
        return MatchesImport(payee, bankText);
    }

    private static bool IsDirtierThanCurrent(string suggestedPayee, string? currentPayee, string? bankText)
    {
        if (string.IsNullOrWhiteSpace(currentPayee) || string.IsNullOrWhiteSpace(bankText))
            return false;

        return Similarity(suggestedPayee, bankText) > Similarity(currentPayee, bankText);
    }

    private static bool MatchesImport(string normalizedPayee, string? import)
    {
        string? normalizedImport = TextPreprocessor.Normalize(import);
        if (normalizedImport == null)
            return false;

        if (string.Equals(normalizedPayee, normalizedImport, StringComparison.Ordinal))
            return true;

        return Similarity(normalizedPayee, normalizedImport) >= RawPayeeSimilarityThreshold;
    }

    private static double Similarity(string? left, string? right)
    {
        string? normalizedLeft = TextPreprocessor.Normalize(left);
        string? normalizedRight = TextPreprocessor.Normalize(right);
        if (normalizedLeft == null || normalizedRight == null)
            return 0;

        return StringSimilarity.RatcliffObershelp(normalizedLeft, normalizedRight);
    }

    private static string? FirstNonEmpty(string? primary, string? fallback) =>
        string.IsNullOrWhiteSpace(primary) ? (string.IsNullOrWhiteSpace(fallback) ? null : fallback) : primary;
}
