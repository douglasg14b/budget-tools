using System.Text.RegularExpressions;

namespace YnabCategoryAi.ML.Travel;

public static class TravelLocationMatch
{
    public const string Match = "match";
    public const string Mismatch = "mismatch";
    public const string Unknown = "unknown";
    public const string Unspecified = "unspecified";
}

public readonly record struct MerchantCityEvidence(string LocationMatch, string? MerchantCity);

/// <summary>
/// String evidence from a bank import name versus an optional trip destination.
/// Destination matching is phrase-based; city extraction uses a trailing <c>CITY ST</c> suffix.
/// </summary>
public static partial class MerchantCity
{
    private static readonly HashSet<string> UsStateAbbreviations = new(StringComparer.OrdinalIgnoreCase)
    {
        "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga",
        "hi", "id", "il", "in", "ia", "ks", "ky", "la", "me", "md",
        "ma", "mi", "mn", "ms", "mo", "mt", "ne", "nv", "nh", "nj",
        "nm", "ny", "nc", "nd", "oh", "ok", "or", "pa", "ri", "sc",
        "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv", "wi", "wy", "dc"
    };

    public static MerchantCityEvidence Classify(string? destination, string? importText)
    {
        string? extracted = ExtractCity(importText);
        if (string.IsNullOrWhiteSpace(destination))
            return new MerchantCityEvidence(TravelLocationMatch.Unspecified, extracted);

        if (ContainsDestination(importText, destination) || CitiesEqual(extracted, destination))
            return new MerchantCityEvidence(TravelLocationMatch.Match, extracted ?? CityCore(destination));

        if (extracted != null)
            return new MerchantCityEvidence(TravelLocationMatch.Mismatch, extracted);

        return new MerchantCityEvidence(TravelLocationMatch.Unknown, null);
    }

    public static string? ExtractCity(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return null;

        string[] tokens = Tokenize(raw);
        if (tokens.Length < 2 || !UsStateAbbreviations.Contains(tokens[^1]))
            return null;

        if (tokens.Length == 2)
            return IsCityToken(tokens[0]) ? tokens[0] : null;

        var cityTokens = new List<string>();
        for (int index = tokens.Length - 2; index >= 1 && cityTokens.Count < 3; index--)
        {
            if (!IsCityToken(tokens[index]))
                break;

            cityTokens.Insert(0, tokens[index]);
        }

        return cityTokens.Count == 0 ? null : string.Join(' ', cityTokens);
    }

    private static bool ContainsDestination(string? importText, string destination)
    {
        if (string.IsNullOrWhiteSpace(importText))
            return false;

        string haystack = Normalize(importText);
        if (ContainsPhrase(haystack, Normalize(destination)))
            return true;

        return ContainsPhrase(haystack, CityCore(destination));
    }

    private static bool CitiesEqual(string? extractedCity, string destination) =>
        extractedCity != null
        && string.Equals(CityCore(extractedCity), CityCore(destination), StringComparison.Ordinal);

    private static string CityCore(string value)
    {
        string normalized = Normalize(value);
        string[] tokens = normalized.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (tokens.Length >= 2 && UsStateAbbreviations.Contains(tokens[^1]))
            return string.Join(' ', tokens[..^1]);

        return normalized;
    }

    private static bool ContainsPhrase(string haystack, string needle)
    {
        if (string.IsNullOrWhiteSpace(needle))
            return false;

        return Regex.IsMatch(haystack, $@"(?:^| ){Regex.Escape(needle)}(?:$| )");
    }

    private static string Normalize(string value) =>
        NonAlphanumeric().Replace(value.ToLowerInvariant(), " ").Trim();

    private static string[] Tokenize(string raw) =>
        raw.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    private static bool IsCityToken(string token)
    {
        if (token.Length < 2)
            return false;

        foreach (char character in token)
        {
            if (!char.IsLetter(character) && character != '.')
                return false;
        }

        return true;
    }

    [GeneratedRegex(@"[^a-z0-9]+")]
    private static partial Regex NonAlphanumeric();
}
