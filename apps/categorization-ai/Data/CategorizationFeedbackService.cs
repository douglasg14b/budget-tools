using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using YnabCategoryAi.Data.Entities;
using YnabCategoryAi.ML;

namespace YnabCategoryAi.Data;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum CategorizationFeedbackAction
{
    Approved,
    Rejected,
    Changed
}

public sealed record CategorizationFeedbackRequest
{
    public required string TransactionId { get; init; }
    public required CategorizationFeedbackAction Action { get; init; }
    public required CategorizationProposal Proposal { get; init; }
    public string? ChosenCategory { get; init; }
    public string? ChosenCategoryGroup { get; init; }
    public string? ChosenCategoryId { get; init; }
    public string? Notes { get; init; }
}

/// <summary>
/// Records user approval/denial/category changes for audit and accuracy tracking.
/// Retraining uses approved categorized transactions from <see cref="TransactionQueries.GetTrainingTransactions"/>;
/// feedback becomes training data once the transaction is categorized and synced to the database.
/// </summary>
public sealed class CategorizationFeedbackService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Converters = { new JsonStringEnumConverter() }
    };

    private readonly BudgetToolsContext _db;

    public CategorizationFeedbackService(BudgetToolsContext db) => _db = db;

    public async Task<CategorizationFeedback> RecordAsync(
        CategorizationFeedbackRequest request,
        CancellationToken cancellationToken = default)
    {
        Validate(request);

        var entry = new CategorizationFeedback
        {
            TransactionId = request.TransactionId,
            Action = request.Action.ToString(),
            SuggestedCategory = request.Proposal.SuggestedCategory,
            SuggestedCategoryGroup = request.Proposal.SuggestedCategoryGroup,
            SuggestedConfidence = request.Proposal.Confidence,
            SuggestedMethod = request.Proposal.Method.ToString(),
            SuggestedTier = request.Proposal.Tier.ToString(),
            ChosenCategory = request.ChosenCategory,
            ChosenCategoryGroup = request.ChosenCategoryGroup,
            ChosenCategoryId = request.ChosenCategoryId,
            ProposalSnapshot = JsonSerializer.Serialize(request.Proposal, JsonOptions),
            Notes = request.Notes,
            CreatedAt = DateTime.UtcNow
        };

        _db.CategorizationFeedback.Add(entry);
        await _db.SaveChangesAsync(cancellationToken);
        return entry;
    }

    public async Task<IReadOnlyList<CategorizationFeedback>> GetForTransactionAsync(
        string transactionId,
        CancellationToken cancellationToken = default) =>
        await _db.CategorizationFeedback
            .Where(f => f.TransactionId == transactionId)
            .OrderByDescending(f => f.CreatedAt)
            .ToListAsync(cancellationToken);

    public async Task<FeedbackAccuracySummary> GetAccuracySummaryAsync(
        DateTime? since = null,
        CancellationToken cancellationToken = default)
    {
        IQueryable<CategorizationFeedback> query = _db.CategorizationFeedback;
        if (since != null)
            query = query.Where(f => f.CreatedAt >= since);

        List<CategorizationFeedback> rows = await query.ToListAsync(cancellationToken);

        int approved = rows.Count(r => r.Action == nameof(CategorizationFeedbackAction.Approved));
        int changed = rows.Count(r => r.Action == nameof(CategorizationFeedbackAction.Changed));
        int rejected = rows.Count(r => r.Action == nameof(CategorizationFeedbackAction.Rejected));
        int accepted = approved + changed;
        int suggestionFollowed = rows.Count(r =>
            r.Action == nameof(CategorizationFeedbackAction.Approved)
            || (r.Action == nameof(CategorizationFeedbackAction.Changed)
                && CategoryNormalizer.AreEquivalent(r.SuggestedCategory, r.ChosenCategory)));

        return new FeedbackAccuracySummary
        {
            Total = rows.Count,
            Approved = approved,
            Changed = changed,
            Rejected = rejected,
            AcceptanceRate = rows.Count == 0 ? 0 : (double)accepted / rows.Count,
            SuggestionFollowRate = accepted == 0 ? 0 : (double)suggestionFollowed / accepted
        };
    }

    private static void Validate(CategorizationFeedbackRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.TransactionId))
            throw new ArgumentException("TransactionId is required.", nameof(request));

        switch (request.Action)
        {
            case CategorizationFeedbackAction.Approved:
                if (request.Proposal.SuggestedCategory == null)
                    throw new ArgumentException("Cannot approve a proposal with no suggested category.");
                break;

            case CategorizationFeedbackAction.Changed:
                if (string.IsNullOrWhiteSpace(request.ChosenCategory))
                    throw new ArgumentException("ChosenCategory is required when action is Changed.");
                break;

            case CategorizationFeedbackAction.Rejected:
                break;
        }
    }
}

public sealed class FeedbackAccuracySummary
{
    public required int Total { get; init; }
    public required int Approved { get; init; }
    public required int Changed { get; init; }
    public required int Rejected { get; init; }
    public required double AcceptanceRate { get; init; }
    public required double SuggestionFollowRate { get; init; }
}
