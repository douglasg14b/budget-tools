using System.Text.RegularExpressions;
using YnabCategoryAi.Data;

namespace YnabCategoryAi.ML;

/// <summary>
/// Deterministic import-string variants for payee-mapping training and lookup densification.
/// Operates on raw text first, then normalizes via <see cref="TextPreprocessor"/>.
/// </summary>
public static partial class ImportStringAugmenter
{
    private static readonly string[] ProcessorPrefixes =
    [
        @"^sq\s*\*",
        @"^tst\*?",
        @"^sp\s+",
        @"^amzn\s+mktp",
        @"^paypal\s*\*",
        @"^checkcard\s*",
        @"^med\*?",
        @"^brghtwhl\*?"
    ];

    private static readonly string[] UsStateAbbreviations =
    [
        "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga",
        "hi", "id", "il", "in", "ia", "ks", "ky", "la", "me", "md",
        "ma", "mi", "mn", "ms", "mo", "mt", "ne", "nv", "nh", "nj",
        "nm", "ny", "nc", "nd", "oh", "ok", "or", "pa", "ri", "sc",
        "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv", "wi", "wy", "dc"
    ];

    public static IEnumerable<string> Augment(string? rawImport) =>
        AugmentDetailed(rawImport).Select(variant => variant.Import);

    /// <summary>
    /// Normalized variants, flagging the ones that drop merchant-name words (<see cref="ExtractMerchantCore"/>).
    /// A truncated variant can equal a different merchant's name ("The Local Station" → "the local"),
    /// so it is only safe for fuzzy or learned matching, never exact lookup.
    /// </summary>
    public static IEnumerable<(string Import, bool IsTruncated)> AugmentDetailed(string? rawImport)
    {
        if (string.IsNullOrWhiteSpace(rawImport))
            yield break;

        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach ((string rawVariant, bool isTruncated) in GenerateRawVariants(rawImport))
        {
            string? normalized = TextPreprocessor.Normalize(rawVariant);
            if (normalized != null && seen.Add(normalized))
                yield return (normalized, isTruncated);
        }
    }

    public static IEnumerable<PayeeMappingExample> Expand(PayeeMappingExample example) =>
        YieldDistinct(example.ImportText, example.CanonicalPayee);

    public static IEnumerable<PayeeMappingExample> AugmentTransaction(TrainingTransaction transaction)
    {
        foreach (AugmentedPayeeImport entry in AugmentTransactionDetailed(transaction))
            yield return new PayeeMappingExample(entry.ImportText, entry.CanonicalPayee);
    }

    public static IEnumerable<AugmentedPayeeImport> AugmentTransactionDetailed(TrainingTransaction transaction)
    {
        if (string.IsNullOrWhiteSpace(transaction.PayeeName))
            yield break;

        string? canonicalNormalized = TextPreprocessor.Normalize(transaction.PayeeName);

        foreach ((string? raw, bool isFromImportPayee) in new[]
                 {
                     (transaction.ImportPayeeNameOriginal, false),
                     (transaction.ImportPayeeName, true)
                 })
        {
            if (string.IsNullOrWhiteSpace(raw))
                continue;

            foreach ((string import, bool isTruncated) in AugmentDetailed(raw))
            {
                if (canonicalNormalized != null
                    && !string.Equals(import, canonicalNormalized, StringComparison.Ordinal))
                {
                    yield return new AugmentedPayeeImport(import, transaction.PayeeName, isFromImportPayee, isTruncated);
                }
            }
        }
    }

    private static IEnumerable<PayeeMappingExample> YieldDistinct(string importText, string canonicalPayee)
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { importText };
        yield return new PayeeMappingExample(importText, canonicalPayee);

        // Re-augment from normalized import to produce sibling variants (prefix strip etc. on denormalized proxy)
        foreach (string variant in Augment(importText))
        {
            if (seen.Add(variant))
                yield return new PayeeMappingExample(variant, canonicalPayee);
        }
    }

    private static IEnumerable<(string Variant, bool IsTruncated)> GenerateRawVariants(string raw)
    {
        yield return (raw, false);

        string strippedPrefix = StripProcessorPrefixes(raw);
        if (!string.Equals(strippedPrefix, raw, StringComparison.OrdinalIgnoreCase))
            yield return (strippedPrefix, false);

        string strippedStore = StripStoreNumbers(raw);
        if (!string.Equals(strippedStore, raw, StringComparison.OrdinalIgnoreCase))
            yield return (strippedStore, false);

        string strippedPhone = StripPhoneNumbers(raw);
        if (!string.Equals(strippedPhone, raw, StringComparison.OrdinalIgnoreCase))
            yield return (strippedPhone, false);

        string strippedDash = StripTrailingDashSegments(raw);
        if (!string.Equals(strippedDash, raw, StringComparison.OrdinalIgnoreCase))
            yield return (strippedDash, false);

        string strippedLocation = StripCityStateSuffix(raw);
        if (!string.Equals(strippedLocation, raw, StringComparison.OrdinalIgnoreCase))
            yield return (strippedLocation, false);

        // Combined: prefix + store + location strips on progressively cleaned text.
        // Yielded before the truncated cores so a shared normalized form keeps its exact-safe flag.
        string combined = StripCityStateSuffix(StripStoreNumbers(StripProcessorPrefixes(raw)));
        combined = StripTrailingDashSegments(combined).Trim();
        if (!string.IsNullOrWhiteSpace(combined))
            yield return (combined, false);

        string coreWords = ExtractMerchantCore(raw, maxWords: 4);
        if (!string.Equals(coreWords, raw, StringComparison.OrdinalIgnoreCase))
            yield return (coreWords, true);

        string coreWords2 = ExtractMerchantCore(raw, maxWords: 2);
        if (!string.Equals(coreWords2, raw, StringComparison.OrdinalIgnoreCase))
            yield return (coreWords2, true);
    }

    private static string StripProcessorPrefixes(string raw)
    {
        string result = raw.Trim();
        bool changed;
        do
        {
            changed = false;
            foreach (string pattern in ProcessorPrefixes)
            {
                string next = Regex.Replace(result, pattern, string.Empty, RegexOptions.IgnoreCase).Trim();
                if (!string.Equals(next, result, StringComparison.OrdinalIgnoreCase))
                {
                    result = next;
                    changed = true;
                }
            }
        } while (changed);

        return result;
    }

    private static string StripStoreNumbers(string raw) =>
        StoreNumberRegex().Replace(raw, string.Empty).Trim();

    private static string StripPhoneNumbers(string raw) =>
        PhoneNumberRegex().Replace(raw, string.Empty).Trim();

    private static string StripTrailingDashSegments(string raw)
    {
        int dashIndex = raw.IndexOf(" - ", StringComparison.Ordinal);
        if (dashIndex < 0)
            return raw;

        return raw[..dashIndex].Trim();
    }

    private static string StripCityStateSuffix(string raw)
    {
        string[] tokens = raw.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (tokens.Length < 2)
            return raw;

        string last = tokens[^1].ToLowerInvariant();
        if (UsStateAbbreviations.Contains(last))
            return string.Join(' ', tokens[..^1]);

        if (tokens.Length >= 3
            && UsStateAbbreviations.Contains(tokens[^1].ToLowerInvariant())
            && tokens[^2].Length >= 3)
        {
            return string.Join(' ', tokens[..^2]);
        }

        return raw;
    }

    private static string ExtractMerchantCore(string raw, int maxWords)
    {
        string[] tokens = raw.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var significant = tokens
            .Where(t => t.Length > 2 && !t.All(char.IsDigit))
            .Take(maxWords)
            .ToArray();

        return significant.Length == 0 ? raw : string.Join(' ', significant);
    }

    [GeneratedRegex(@"#\s*\d+", RegexOptions.IgnoreCase)]
    private static partial Regex StoreNumberRegex();

    [GeneratedRegex(@"\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b")]
    private static partial Regex PhoneNumberRegex();
}

public readonly record struct AugmentedPayeeImport(
    string ImportText,
    string CanonicalPayee,
    bool IsFromImportPayee,
    bool IsTruncated);
