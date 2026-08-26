import type { ApprovalTier } from '@budget-tools/web-sdk';

export const APPROVAL_TIERS = [
    'AutoApply',
    'Suggested',
    'Review',
    'Blocked',
] as const satisfies readonly ApprovalTier[];

export type QueueSearchState = {
    tiers: ApprovalTier[] | undefined;
    accountId: string | undefined;
    transactionId: string | undefined;
    q: string | undefined;
};

const APPROVAL_TIER_SET: ReadonlySet<string> = new Set(APPROVAL_TIERS);

function isApprovalTier(value: string): value is ApprovalTier {
    return APPROVAL_TIER_SET.has(value);
}

/**
 * Reads review-queue filters from the URL. Unknown `tier` tokens are ignored.
 */
export function parseQueueSearchParams(searchParams: URLSearchParams): QueueSearchState {
    const accountId = searchParams.get('accountId')?.trim() || undefined;
    const transactionId = searchParams.get('transactionId')?.trim() || undefined;
    const qRaw = searchParams.get('q');
    const q = qRaw?.trim() ? qRaw : undefined;
    const tierRaw = searchParams.get('tier');
    if (!tierRaw?.trim()) {
        return { tiers: undefined, accountId, transactionId, q };
    }

    const selected = new Set<ApprovalTier>();
    for (const part of tierRaw.split(',')) {
        const trimmed = part.trim();
        if (isApprovalTier(trimmed)) {
            selected.add(trimmed);
        }
    }

    const tiers = APPROVAL_TIERS.filter((tier) => selected.has(tier));
    return {
        tiers: tiers.length > 0 ? tiers : undefined,
        accountId,
        transactionId,
        q,
    };
}

/**
 * Writes review-queue filters to URL search params. Omitted values mean "all / default".
 */
export function serializeQueueSearchParams(state: QueueSearchState): URLSearchParams {
    const params = new URLSearchParams();
    if (state.tiers && state.tiers.length > 0) {
        params.set('tier', APPROVAL_TIERS.filter((tier) => state.tiers?.includes(tier)).join(','));
    }
    if (state.accountId) {
        params.set('accountId', state.accountId);
    }
    if (state.transactionId) {
        params.set('transactionId', state.transactionId);
    }
    if (state.q) {
        params.set('q', state.q);
    }
    return params;
}

/**
 * Toggles a tier chip. No `tiers` in the URL means all are visible; the first click filters to that tier.
 */
export function toggleTierFilter(
    current: ApprovalTier[] | undefined,
    clicked: ApprovalTier,
): ApprovalTier[] | undefined {
    if (current === undefined) {
        return [clicked];
    }

    if (current.includes(clicked)) {
        const remaining = current.filter((tier) => tier !== clicked);
        return remaining.length > 0 ? remaining : undefined;
    }

    const next = APPROVAL_TIERS.filter((tier) => tier === clicked || current.includes(tier));
    return next.length === APPROVAL_TIERS.length ? undefined : next;
}

export function queueFiltersActive(search: Pick<QueueSearchState, 'accountId' | 'q' | 'tiers'>): boolean {
    return search.tiers !== undefined || Boolean(search.accountId) || Boolean(search.q);
}
