export type ClassificationDecisionKind = 'category' | 'split';

export type ClassificationDecisionLineDto = {
    amount: number;
    categoryId: string;
    memo?: string | null;
};

export type ClassificationDecisionDto = {
    transactionId: string;
    kind: ClassificationDecisionKind;
    /** Required when kind is category. */
    categoryId?: string;
    payeeName?: string;
    /** Required when kind is split. */
    lines?: ClassificationDecisionLineDto[];
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
