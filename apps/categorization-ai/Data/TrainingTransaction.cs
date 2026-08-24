namespace YnabCategoryAi.Data;

/// <summary>A cleared, accepted, categorized transaction used for training and evaluation.</summary>
public record TrainingTransaction(
    string Id,
    string? ImportPayeeNameOriginal,
    string? ImportPayeeName,
    string? PayeeName,
    string? PayeeId,
    string CategoryName,
    string CategoryGroupName,
    string? CategoryId,
    int Amount,
    string AccountName,
    string? Memo,
    DateOnly Date);

/// <summary>A transaction that still needs a category assignment.</summary>
public record PendingTransaction(
    string Id,
    string? ImportPayeeNameOriginal,
    string? ImportPayeeName,
    string? PayeeName,
    string? PayeeId,
    int Amount,
    string AccountName,
    string? Memo,
    DateOnly Date,
    string AccountId = "");

/// <summary>
/// Cleared non-split history used to detect periodic series, including unapproved queue items.
/// Category is null when the row has no real budget category yet (including Uncategorized / Inflow placeholders).
/// </summary>
public record PeriodicHistoryTransaction(
    string Id,
    string? ImportPayeeNameOriginal,
    string? PayeeName,
    string? PayeeId,
    string? CategoryName,
    int Amount,
    DateOnly Date);
