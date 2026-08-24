using YnabCategoryAi.Data;

namespace YnabCategoryAi.ML.Travel;

public static class TravelWindowMatcher
{
    public static TravelWindowRecord? Match(
        PendingTransaction transaction,
        PeriodicMatch? periodicMatch,
        IReadOnlyList<TravelWindowRecord> windows)
    {
        if (transaction.Amount >= 0 || periodicMatch != null || windows.Count == 0)
            return null;

        TravelWindowRecord? matched = null;
        foreach (TravelWindowRecord window in windows)
        {
            if (!DateInRange(transaction.Date, window.StartDate, window.EndDate))
                continue;

            if (window.AccountId != null
                && !string.Equals(window.AccountId, transaction.AccountId, StringComparison.Ordinal))
            {
                continue;
            }

            if (matched != null)
            {
                throw new InvalidOperationException(
                    $"Transaction {transaction.Id} matches overlapping travel windows '{matched.Name}' and '{window.Name}'.");
            }

            matched = window;
        }

        return matched;
    }

    private static bool DateInRange(DateOnly date, DateOnly start, DateOnly end) =>
        date >= start && date <= end;
}
