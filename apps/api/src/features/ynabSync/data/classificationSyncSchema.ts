export type ClassificationSyncStatus = 'pending' | 'syncing' | 'synced' | 'failed' | 'confirmed';

export type ClassificationSyncTable = {
    transactionId: string;
    decisionJson: string;
    status: ClassificationSyncStatus;
    batchId: string | null;
    attemptCount: number;
    lastError: string | null;
    createdAt: string;
    updatedAt: string;
    syncedAt: string | null;
    confirmedAt: string | null;
};
