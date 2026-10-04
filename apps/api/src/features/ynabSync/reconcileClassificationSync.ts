import type { AppDatabaseClient } from '../../data-persistence/database';
import type { MirroredAnnotations } from './classificationDecision';
import {
    confirmSyncedAbsentFromPending,
    deleteConfirmedPresentInPending,
    deleteSettledAnnotations,
    listExcludedTransactionIds,
} from './data/classificationSyncRepo';

/** A transaction in the current Postgres pending set, with the fields annotations are checked against. */
export type PendingTransactionMirror = MirroredAnnotations & {
    readonly id: string;
};

/**
 * Aligns classification rows with the current Postgres pending set, then
 * returns ids that must stay out of the review queue.
 */
export async function reconcileClassificationSync(
    pending: readonly PendingTransactionMirror[],
    db?: AppDatabaseClient,
): Promise<Set<string>> {
    const pendingById = new Map(pending.map((transaction) => [transaction.id, transaction]));
    const pendingIds = new Set(pendingById.keys());
    await confirmSyncedAbsentFromPending(pendingIds, db);
    await deleteConfirmedPresentInPending(pendingIds, db);
    await deleteSettledAnnotations(pendingById, db);
    return await listExcludedTransactionIds(db);
}
