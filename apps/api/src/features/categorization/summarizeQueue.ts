import type { ApprovalTier, CategorizationProposalDto, QueueSummaryDto } from './categorizationDtos';

/**
 * Tier counts for the scored (cached) queue, not the full pending table.
 */
export function summarizeQueue(proposals: readonly CategorizationProposalDto[]): QueueSummaryDto {
    const summary: QueueSummaryDto = {
        total: proposals.length,
        autoApply: 0,
        suggested: 0,
        review: 0,
        blocked: 0,
    };

    for (const proposal of proposals) {
        const key = TIER_SUMMARY_KEY[proposal.tier];
        summary[key] += 1;
    }

    return summary;
}

const TIER_SUMMARY_KEY: Record<ApprovalTier, Exclude<keyof QueueSummaryDto, 'total'>> = {
    AutoApply: 'autoApply',
    Suggested: 'suggested',
    Review: 'review',
    Blocked: 'blocked',
};
