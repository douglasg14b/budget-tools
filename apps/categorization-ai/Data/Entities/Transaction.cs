using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace YnabCategoryAi.Data.Entities;

[Table("transactions")]
public class Transaction
{
    [Key]
    [Column("id")]
    public string Id { get; set; } = null!;

    [Column("date")]
    public DateOnly Date { get; set; }

    [Column("amount")]
    public int Amount { get; set; }

    [Column("memo")]
    public string? Memo { get; set; }

    [Column("cleared")]
    public string Cleared { get; set; } = null!;

    [Column("approved")]
    public bool Approved { get; set; }

    [Column("flag_color")]
    public string? FlagColor { get; set; }

    [Column("flag_name")]
    public string? FlagName { get; set; }

    [Column("account_id")]
    public string AccountId { get; set; } = null!;

    [Column("payee_id")]
    public string? PayeeId { get; set; }

    [Column("category_id")]
    public string? CategoryId { get; set; }

    [Column("transfer_account_id")]
    public string? TransferAccountId { get; set; }

    [Column("transfer_transaction_id")]
    public string? TransferTransactionId { get; set; }

    [Column("matched_transaction_id")]
    public string? MatchedTransactionId { get; set; }

    [Column("import_id")]
    public string? ImportId { get; set; }

    [Column("import_payee_name")]
    public string? ImportPayeeName { get; set; }

    [Column("import_payee_name_original")]
    public string? ImportPayeeNameOriginal { get; set; }

    [Column("debt_transaction_type")]
    public string? DebtTransactionType { get; set; }

    [Column("deleted")]
    public bool Deleted { get; set; }

    [Column("account_name")]
    public string AccountName { get; set; } = null!;

    [Column("payee_name")]
    public string? PayeeName { get; set; }

    [Column("category_name")]
    public string? CategoryName { get; set; }

    /// <summary>Raw JSONB array of sub-transaction objects. Empty array <c>[]</c> means this is not a split transaction.</summary>
    [Column("subtransactions", TypeName = "jsonb")]
    public string Subtransactions { get; set; } = "[]";

    /// <summary>Raw JSONB object containing tracking metadata (first_seen_date, first_cleared_date, etc.).</summary>
    [Column("meta", TypeName = "jsonb")]
    public string Meta { get; set; } = "{}";

    public Category? Category { get; set; }
}
