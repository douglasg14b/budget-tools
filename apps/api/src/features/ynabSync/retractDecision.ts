import type { AppDatabaseClient } from '../../data-persistence/database';
import { requireLiveMode } from '../operatingMode/data/operatingModeRepo';
import { deleteRetractableClassification } from './data/classificationSyncRepo';

export type RetractDecisionContext = {
    readonly db?: AppDatabaseClient;
    readonly requireLive?: (db?: AppDatabaseClient) => Promise<void>;
};

/**
 * Removes a pending or failed live decision. Already-flushed rows refuse.
 */
export async function retractDecision(transactionId: string, context: RetractDecisionContext = {}): Promise<void> {
    const trimmed = transactionId.trim();
    const database = context.db;
    await (context.requireLive ?? requireLiveMode)(database);
    await deleteRetractableClassification(trimmed, database);
}
