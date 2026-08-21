namespace YnabCategoryAi.ML;

/// <summary>
/// Ratcliff-Obershelp string similarity (same metric as transaction-cleaner).
/// Returns a value in [0, 1] where 1 is an exact match.
/// </summary>
public static class StringSimilarity
{
    public static double RatcliffObershelp(string? a, string? b)
    {
        if (string.IsNullOrEmpty(a) && string.IsNullOrEmpty(b))
            return 1.0;

        if (string.IsNullOrEmpty(a) || string.IsNullOrEmpty(b))
            return 0.0;

        if (string.Equals(a, b, StringComparison.Ordinal))
            return 1.0;

        int matches = CountMatches(a.AsSpan(), b.AsSpan());
        return (2.0 * matches) / (a.Length + b.Length);
    }

    private static int CountMatches(ReadOnlySpan<char> left, ReadOnlySpan<char> right)
    {
        if (left.IsEmpty || right.IsEmpty)
            return 0;

        int length = FindLongestMatch(left, right, out int startLeft, out int startRight);
        if (length == 0)
            return 0;

        int before = CountMatches(left[..startLeft], right[..startRight]);
        int after = CountMatches(
            left[(startLeft + length)..],
            right[(startRight + length)..]);

        return length + before + after;
    }

    private static int FindLongestMatch(
        ReadOnlySpan<char> left,
        ReadOnlySpan<char> right,
        out int startLeft,
        out int startRight)
    {
        startLeft = 0;
        startRight = 0;
        int maxLength = 0;

        for (int i = 0; i < left.Length; i++)
        {
            for (int j = 0; j < right.Length; j++)
            {
                int length = 0;
                while (i + length < left.Length
                    && j + length < right.Length
                    && left[i + length] == right[j + length])
                {
                    length++;
                }

                if (length > maxLength)
                {
                    maxLength = length;
                    startLeft = i;
                    startRight = j;
                }
            }
        }

        return maxLength;
    }
}
