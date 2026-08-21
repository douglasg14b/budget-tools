using YnabCategoryAi.Configuration;

namespace YnabCategoryAi.ML;

public enum ExclusionKind
{
    Payee,
    Check
}

public sealed class ClassificationExclusionMatcher
{
    private readonly ClassificationExclusionSettings _settings;

    public ClassificationExclusionMatcher(ClassificationExclusionSettings settings) =>
        _settings = settings;

    public bool TryGetExclusion(
        string? importOriginal,
        string? importPayee,
        string? payeeName,
        string? memo,
        out ExclusionKind kind)
    {
        string payeeText = Combine(importOriginal, importPayee, payeeName);
        string checkText = Combine(importOriginal, importPayee, payeeName, memo);

        if (MatchesAny(payeeText, _settings.PayeePatterns))
        {
            kind = ExclusionKind.Payee;
            return true;
        }

        if (MatchesAny(checkText, _settings.CheckPatterns))
        {
            kind = ExclusionKind.Check;
            return true;
        }

        kind = default;
        return false;
    }

    private static string Combine(params string?[] parts) =>
        string.Join(
            " ",
            parts
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .Select(s => TextPreprocessor.Normalize(s))
                .Where(s => s != null));

    private static bool MatchesAny(string normalizedText, IEnumerable<string> patterns)
    {
        if (string.IsNullOrWhiteSpace(normalizedText))
            return false;

        return patterns.Any(pattern =>
        {
            string? normalizedPattern = TextPreprocessor.Normalize(pattern);
            return normalizedPattern != null && normalizedText.Contains(normalizedPattern, StringComparison.Ordinal);
        });
    }
}
