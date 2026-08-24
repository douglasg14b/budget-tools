using Microsoft.EntityFrameworkCore;
using YnabCategoryAi.Data.Entities;

namespace YnabCategoryAi.Data;

public static class TransactionQueries
{
    public static bool IsTrainingEligible(Transaction t) =>
        t.Approved
        && t.CategoryId != null
        && !string.IsNullOrWhiteSpace(t.CategoryName)
        && !CategoryNormalizer.IsExcludedName(t.CategoryName)
        && !t.Deleted
        && t.TransferAccountId == null
        && IsNonSplit(t)
        && IsCleared(t);

    public static bool IsPendingCategorization(Transaction t) =>
        !t.Deleted
        && t.TransferAccountId == null
        && IsNonSplit(t)
        && IsCleared(t)
        && (!t.Approved || t.CategoryId == null || CategoryNormalizer.IsExcludedName(t.CategoryName));

    private static bool IsNonSplit(Transaction t) =>
        t.Subtransactions == "[]";

    /// <summary>YNAB has matched this to the bank (cleared or reconciled). Uncleared rows stay out of scoring.</summary>
    public static bool IsCleared(Transaction t) =>
        t.Cleared == "cleared" || t.Cleared == "reconciled";

    public static TrainingTransaction[] GetTrainingTransactions(BudgetToolsContext db)
    {
        Dictionary<string, (string Name, string GroupName)> categoryIndex = db.Categories
            .Include(c => c.Group)
            .ToDictionary(c => c.Id, c => (c.Name, c.Group.Name));

        List<Transaction> rows = QueryReviewable(db.Transactions)
            .Where(t => t.Approved && t.CategoryId != null && t.CategoryName != null && t.CategoryName != "")
            .ToList();

        return rows
            .Where(IsTrainingEligible)
            .Select(t => ToTrainingTransaction(t, categoryIndex))
            .ToArray();
    }

    public static PendingTransaction[] GetPendingTransactions(
        BudgetToolsContext db,
        IReadOnlyList<string>? transactionIds = null)
    {
        if (transactionIds is { Count: 0 })
        {
            return [];
        }

        IQueryable<Transaction> query = QueryReviewable(db.Transactions)
            .Where(t =>
                !t.Approved
                || t.CategoryId == null
                || t.CategoryName == null
                || t.CategoryName == ""
                || t.CategoryName.ToLower() == "uncategorized"
                || t.CategoryName.ToLower().StartsWith("inflow:"));

        if (transactionIds is not null)
        {
            List<string> ids = transactionIds.ToList();
            query = query.Where(t => ids.Contains(t.Id));
        }

        List<Transaction> rows = query.ToList();
        IEnumerable<PendingTransaction> pending = rows
            .Where(IsPendingCategorization)
            .Select(ToPendingTransaction);

        if (transactionIds is null)
        {
            return pending.ToArray();
        }

        Dictionary<string, PendingTransaction> byId = pending.ToDictionary(transaction => transaction.Id);
        return transactionIds
            .Where(byId.ContainsKey)
            .Select(id => byId[id])
            .ToArray();
    }

    /// <summary>
    /// Cleared, non-split, non-transfer rows used to detect cadence — includes unapproved queue items
    /// so a backlog of pending subscription charges does not look like a series that went quiet.
    /// </summary>
    public static PeriodicHistoryTransaction[] GetPeriodicHistory(BudgetToolsContext db)
    {
        return QueryReviewable(db.Transactions)
            .ToList()
            .Select(t => new PeriodicHistoryTransaction(
                t.Id,
                t.ImportPayeeNameOriginal,
                t.PayeeName,
                t.PayeeId,
                CategoryNormalizer.IsExcludedName(t.CategoryName) ? null : t.CategoryName,
                t.Amount,
                t.Date))
            .ToArray();
    }

    /// <summary>
    /// Server-side filter for rows that can appear in training or the review queue.
    /// Uncleared YNAB transactions are omitted — they are not settled with the bank.
    /// Avoids pulling the entire transactions table into memory.
    /// </summary>
    private static IQueryable<Transaction> QueryReviewable(IQueryable<Transaction> source) =>
        source.Where(t =>
            !t.Deleted
            && t.TransferAccountId == null
            && t.Subtransactions == "[]"
            // Inlined so EF can translate it; must stay equivalent to IsCleared.
            && (t.Cleared == "cleared" || t.Cleared == "reconciled"));

    private static TrainingTransaction ToTrainingTransaction(
        Transaction t,
        Dictionary<string, (string Name, string GroupName)> categoryIndex)
    {
        string categoryName;
        string groupName;

        if (t.CategoryId != null && categoryIndex.TryGetValue(t.CategoryId, out var cat))
        {
            categoryName = CategoryNormalizer.Normalize(cat.Name)!;
            groupName = CategoryNormalizer.Normalize(cat.GroupName) ?? string.Empty;
        }
        else
        {
            categoryName = CategoryNormalizer.Normalize(t.CategoryName)!;
            groupName = string.Empty;
        }

        return new(
            t.Id,
            t.ImportPayeeNameOriginal,
            t.ImportPayeeName,
            t.PayeeName,
            t.PayeeId,
            categoryName,
            groupName,
            t.CategoryId,
            t.Amount,
            t.AccountName,
            t.Memo,
            t.Date);
    }

    private static PendingTransaction ToPendingTransaction(Transaction t) =>
        new(
            t.Id,
            t.ImportPayeeNameOriginal,
            t.ImportPayeeName,
            t.PayeeName,
            t.PayeeId,
            t.Amount,
            t.AccountName,
            t.Memo,
            t.Date,
            t.AccountId);
}
