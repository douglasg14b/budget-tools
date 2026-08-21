using Microsoft.EntityFrameworkCore;
using YnabCategoryAi.Data.Entities;

namespace YnabCategoryAi.Data;

public static class TransactionQueries
{
    private static readonly string[] ExcludedCategoryPrefixes = ["Inflow:"];

    public static bool IsTrainingEligible(Transaction t) =>
        t.Approved
        && t.CategoryId != null
        && !string.IsNullOrWhiteSpace(t.CategoryName)
        && !IsExcludedCategory(t.CategoryName)
        && !t.Deleted
        && t.TransferAccountId == null
        && IsNonSplit(t)
        && (t.Cleared == "cleared" || t.Cleared == "reconciled");

    public static bool IsPendingCategorization(Transaction t) =>
        !t.Deleted
        && t.TransferAccountId == null
        && IsNonSplit(t)
        && (t.Cleared == "cleared" || t.Cleared == "reconciled")
        && (!t.Approved || t.CategoryId == null || IsExcludedCategory(t.CategoryName));

    private static bool IsNonSplit(Transaction t) =>
        t.Subtransactions == "[]";

    private static bool IsExcludedCategory(string? categoryName)
    {
        if (string.IsNullOrWhiteSpace(categoryName))
            return true;

        if (string.Equals(categoryName, "Uncategorized", StringComparison.OrdinalIgnoreCase))
            return true;

        return ExcludedCategoryPrefixes.Any(prefix =>
            categoryName.StartsWith(prefix, StringComparison.OrdinalIgnoreCase));
    }

    public static TrainingTransaction[] GetTrainingTransactions(BudgetToolsContext db)
    {
        Dictionary<string, (string Name, string GroupName)> categoryIndex = db.Categories
            .Include(c => c.Group)
            .ToDictionary(c => c.Id, c => (c.Name, c.Group.Name));

        return db.Transactions
            .AsEnumerable()
            .Where(IsTrainingEligible)
            .Select(t => ToTrainingTransaction(t, categoryIndex))
            .ToArray();
    }

    public static PendingTransaction[] GetPendingTransactions(BudgetToolsContext db) =>
        db.Transactions
            .AsEnumerable()
            .Where(IsPendingCategorization)
            .Select(ToPendingTransaction)
            .ToArray();

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
            t.Date);
}
