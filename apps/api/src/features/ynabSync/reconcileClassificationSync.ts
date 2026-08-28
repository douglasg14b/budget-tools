import type { AppDatabaseClient } from '../../data-persistence/database';
import {
    confirmSyncedAbsentFromPending,
    deleteConfirmedPresentInPending,
    listExcludedTransactionIds,
} from './data/classificationSyncRepo';

/**
 * Aligns SQLite classification rows with the current Postgres pending set, then
 * returns ids that must stay out of the review queue.
 */
export async function reconcileClassificationSync(
    pendingIds: readonly string[],
    db?: AppDatabaseClient,
): Promise<Set<string>> {
    const pending = new Set(pendingIds);
    await confirmSyncedAbsentFromPending(pending, db);
    await deleteConfirmedPresentInPending(pending, db);
    return await listExcludedTransactionIds(db);
}
