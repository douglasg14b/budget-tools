using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace YnabCategoryAi.Data.Entities;

[Table("categorization_feedback")]
public class CategorizationFeedback
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    [Column("transaction_id")]
    public string TransactionId { get; set; } = null!;

    [Column("action")]
    public string Action { get; set; } = null!;

    [Column("suggested_category")]
    public string? SuggestedCategory { get; set; }

    [Column("suggested_category_group")]
    public string? SuggestedCategoryGroup { get; set; }

    [Column("suggested_confidence")]
    public float? SuggestedConfidence { get; set; }

    [Column("suggested_method")]
    public string? SuggestedMethod { get; set; }

    [Column("suggested_tier")]
    public string? SuggestedTier { get; set; }

    [Column("chosen_category")]
    public string? ChosenCategory { get; set; }

    [Column("chosen_category_group")]
    public string? ChosenCategoryGroup { get; set; }

    [Column("chosen_category_id")]
    public string? ChosenCategoryId { get; set; }

    [Column("proposal_snapshot", TypeName = "jsonb")]
    public string ProposalSnapshot { get; set; } = "{}";

    [Column("notes")]
    public string? Notes { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
