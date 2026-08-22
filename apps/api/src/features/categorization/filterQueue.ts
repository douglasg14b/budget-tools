import type { ApprovalTier, CategorizationQueueItemDto } from './categorizationDtos';
import { isApprovalTier } from './parsePredictJson';

export class QueryValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'QueryValidationError';
    }
}

const TIER_ORDER: Record<ApprovalTier, number> = {
    AutoApply: 0,
    Suggested: 1,
    Review: 2,
    Blocked: 3,
};

export type QueueFilter = {
    tiers?: ApprovalTier[];
    accountId?: string;
};

/**
 * Parses a comma-separated `tier` query into ApprovalTier values.
 */
export function parseTierFilter(tier: string | undefined): ApprovalTier[] | undefined {
    if (!tier?.trim()) {
        return undefined;
    }

    const parsed: ApprovalTier[] = [];
    for (const part of tier.split(',')) {
        const trimmed = part.trim();
        if (!trimmed) {
            continue;
        }
        if (!isApprovalTier(trimmed)) {
            throw new QueryValidationError(`Invalid tier: ${trimmed}`);
        }
        parsed.push(trimmed);
    }

    return parsed.length > 0 ? parsed : undefined;
}

/**
 * Filters queue items then sorts by tier priority and date descending.
 */
export function filterAndSortQueueItems(
    items: CategorizationQueueItemDto[],
    filter: QueueFilter,
): CategorizationQueueItemDto[] {
    const filtered = items.filter((item) => {
        if (filter.tiers && !filter.tiers.includes(item.proposal.tier)) {
            return false;
        }
        if (filter.accountId && item.transaction.accountId !== filter.accountId) {
            return false;
        }
        return true;
    });

    return [...filtered].sort((left, right) => {
        const tierDelta = TIER_ORDER[left.proposal.tier] - TIER_ORDER[right.proposal.tier];
        if (tierDelta !== 0) {
            return tierDelta;
        }
        if (left.transaction.date === right.transaction.date) {
            return 0;
        }
        return left.transaction.date < right.transaction.date ? 1 : -1;
    });
}
