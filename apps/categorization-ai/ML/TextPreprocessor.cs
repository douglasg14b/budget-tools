using System.Text;
using System.Text.RegularExpressions;

namespace YnabCategoryAi.ML;

public static class TextPreprocessor
{
    public static string? Normalize(string? input)
    {
        if (string.IsNullOrWhiteSpace(input))
            return null;

        return Regex.Replace(input.ToLowerInvariant().AsAscii(), @"[^\w\s]", "").Trim();
    }

    public static string? Preprocess(string? input) => Normalize(input);

    public static string PrimaryImportText(string? importOriginal, string? importPayee, string? payeeName) =>
        importOriginal ?? importPayee ?? payeeName ?? string.Empty;

    // https://stackoverflow.com/a/135473/3547347
    private static string AsAscii(this string value) =>
        Encoding.ASCII.GetString(
            Encoding.Convert(
                Encoding.UTF8,
                Encoding.GetEncoding(
                    Encoding.ASCII.EncodingName,
                    new EncoderReplacementFallback(string.Empty),
                    new DecoderExceptionFallback()),
                Encoding.UTF8.GetBytes(value)));
}
