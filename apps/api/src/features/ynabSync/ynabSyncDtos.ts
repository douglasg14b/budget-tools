import type { YnabFlagColor } from './ynabFlagColor';

/**
 * `category` and `split` categorize and approve the transaction.
 * `annotate` only sets the parent memo and/or YNAB flag; the transaction stays in the review queue.
 */
export type ClassificationDecisionKind = 'category' | 'split' | 'annotate';

export type ClassificationDecisionLineDto = {
    amount: number;
    categoryId: string;
    memo?: string | null;
};

export type ClassificationDecisionDto = {
    transactionId: string;
    kind: ClassificationDecisionKind;
    /** Required when kind is category. Not allowed for split or annotate. */
    categoryId?: string;
    /** Not allowed for annotate. */
    payeeName?: string;
    /** Required when kind is split. Not allowed for category or annotate. */
    lines?: ClassificationDecisionLineDto[];
    /**
     * Parent transaction memo, at most 500 characters. Omit to leave YNAB's memo unchanged;
     * null or blank clears it. Annotate needs memo and/or flagColor.
     */
    memo?: string | null;
    /** YNAB flag. Omit to leave YNAB's flag unchanged; null clears it. Annotate needs memo and/or flagColor. */
    flagColor?: YnabFlagColor | null;
};

export type ClassificationDecisionsRequestDto = {
    decisions: ClassificationDecisionDto[];
};

export type ClassificationDecisionsResponseDto = {
    accepted: number;
    pendingCount: number;
};

export type OutboundSyncStatusDto = {
    pendingCount: number;
    syncingCount: number;
    failedCount: number;
    syncedUnconfirmedCount: number;
    oldestPendingAt: string | null;
    lastError: string | null;
};

export type OutboundSyncFlushDto = {
    attempted: number;
    synced: number;
    failed: number;
    skipped: boolean;
    skipReason?: string;
};
