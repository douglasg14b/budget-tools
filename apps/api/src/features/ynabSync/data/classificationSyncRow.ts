import type { ClassificationDecision } from '../classificationDecision';
import type { ClassificationSyncStatus } from './classificationSyncSchema';

export type ClassificationSyncRow = {
    readonly transactionId: string;
    readonly decision: ClassificationDecision;
    readonly status: ClassificationSyncStatus;
    readonly batchId: string | null;
    readonly attemptCount: number;
    readonly lastError: string | null;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly syncedAt: string | null;
    readonly confirmedAt: string | null;
};
