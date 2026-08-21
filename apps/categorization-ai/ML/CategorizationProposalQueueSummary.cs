namespace YnabCategoryAi.ML;

public sealed class CategorizationProposalQueueSummary
{
    public required int Total { get; init; }
    public required int AutoApply { get; init; }
    public required int Suggested { get; init; }
    public required int Review { get; init; }
    public required int Blocked { get; init; }

    public static CategorizationProposalQueueSummary From(IEnumerable<CategorizationProposal> proposals)
    {
        var list = proposals.ToList();
        return new CategorizationProposalQueueSummary
        {
            Total = list.Count,
            AutoApply = list.Count(p => p.Tier == ApprovalTier.AutoApply),
            Suggested = list.Count(p => p.Tier == ApprovalTier.Suggested),
            Review = list.Count(p => p.Tier == ApprovalTier.Review),
            Blocked = list.Count(p => p.Tier == ApprovalTier.Blocked)
        };
    }
}
