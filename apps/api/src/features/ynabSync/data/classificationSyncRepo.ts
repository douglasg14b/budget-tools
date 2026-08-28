import type { AppDatabaseClient } from '../../../data-persistence/database';
import { getAppDatabase } from '../../../data-persistence/database';
import { ConflictError } from '../../travelWindows/HttpError';
import type { ClassificationDecision } from '../classificationDecision';
import type { ClassificationSyncRow } from './classificationSyncRow';
import type { ClassificationSyncStatus } from './classificationSyncSchema';

const REPLACEABLE_STATUSES: ReadonlySet<ClassificationSyncStatus> = new Set(['pending', 'failed']);
const EXCLUDED_STATUSES: ClassificationSyncStatus[] = ['pending', 'syncing', 'synced', 'failed'];

export function isReplaceableSyncStatus(status: ClassificationSyncStatus): boolean {
    return REPLACEABLE_STATUSES.has(status);
}

export async function getClassificationSync(
    transactionId: string,
    db?: AppDatabaseClient,
): Promise<ClassificationSyncRow | undefined> {
    const database = db ?? (await getAppDatabase());
    const row = await database
        .selectFrom('classification_sync')
        .selectAll()
        .where('transactionId', '=', transactionId)
        .executeTakeFirst();
    return row ? mapRow(row) : undefined;
}

export async function listExcludedTransactionIds(db?: AppDatabaseClient): Promise<Set<string>> {
    const database = db ?? (await getAppDatabase());
    const rows = await database
        .selectFrom('classification_sync')
        .select('transactionId')
        .where('status', 'in', EXCLUDED_STATUSES)
        .execute();
    return new Set(rows.map((row) => row.transactionId));
}

export async function listPendingClassificationSync(
    limit: number,
    db?: AppDatabaseClient,
): Promise<ClassificationSyncRow[]> {
    const database = db ?? (await getAppDatabase());
    const rows = await database
        .selectFrom('classification_sync')
        .selectAll()
        .where('status', '=', 'pending')
        .orderBy('createdAt', 'asc')
        .orderBy('transactionId', 'asc')
        .limit(limit)
        .execute();
    return rows.map(mapRow);
}

export async function countClassificationSyncByStatus(
    db?: AppDatabaseClient,
): Promise<Record<ClassificationSyncStatus, number>> {
    const database = db ?? (await getAppDatabase());
    const rows = await database.selectFrom('classification_sync').select(['status', 'transactionId']).execute();
    const counts: Record<ClassificationSyncStatus, number> = {
        pending: 0,
        syncing: 0,
        synced: 0,
        failed: 0,
        confirmed: 0,
    };
    for (const row of rows) {
        counts[row.status] += 1;
    }
    return counts;
}

export async function oldestPendingCreatedAt(db?: AppDatabaseClient): Promise<string | null> {
    const database = db ?? (await getAppDatabase());
    const row = await database
        .selectFrom('classification_sync')
        .select('createdAt')
        .where('status', '=', 'pending')
        .orderBy('createdAt', 'asc')
        .executeTakeFirst();
    return row?.createdAt ?? null;
}

export async function latestClassificationSyncError(db?: AppDatabaseClient): Promise<string | null> {
    const database = db ?? (await getAppDatabase());
    const row = await database
        .selectFrom('classification_sync')
        .select('lastError')
        .where('lastError', 'is not', null)
        .orderBy('updatedAt', 'desc')
        .executeTakeFirst();
    return row?.lastError ?? null;
}

/**
 * Inserts or replaces a pending/failed row. Syncing, synced, and confirmed rows refuse replacement.
 */
export async function enqueueClassificationDecision(
    transactionId: string,
    decision: ClassificationDecision,
    db?: AppDatabaseClient,
): Promise<void> {
    const database = db ?? (await getAppDatabase());
    const existing = await getClassificationSync(transactionId, database);
    if (existing && !isReplaceableSyncStatus(existing.status)) {
        throw new ConflictError(
            `transaction ${transactionId} already has a ${existing.status} classification and cannot be replaced`,
        );
    }
    const now = new Date().toISOString();
    const decisionJson = JSON.stringify(decision);
    if (!existing) {
        await database
            .insertInto('classification_sync')
            .values({
                transactionId,
                decisionJson,
                status: 'pending',
                batchId: null,
                attemptCount: 0,
                lastError: null,
                createdAt: now,
                updatedAt: now,
                syncedAt: null,
                confirmedAt: null,
            })
            .execute();
        return;
    }
    await database
        .updateTable('classification_sync')
        .set({
            decisionJson,
            status: 'pending',
            batchId: null,
            lastError: null,
            updatedAt: now,
        })
        .where('transactionId', '=', transactionId)
        .execute();
}

export async function deleteRetractableClassification(
    transactionId: string,
    db?: AppDatabaseClient,
): Promise<'deleted' | 'missing'> {
    const database = db ?? (await getAppDatabase());
    const existing = await getClassificationSync(transactionId, database);
    if (!existing) {
        return 'missing';
    }
    if (!isReplaceableSyncStatus(existing.status)) {
        throw new ConflictError(
            `transaction ${transactionId} is ${existing.status} and can no longer be undone locally`,
        );
    }
    await database.deleteFrom('classification_sync').where('transactionId', '=', transactionId).execute();
    return 'deleted';
}

export async function resumeStaleSyncing(db?: AppDatabaseClient): Promise<number> {
    const database = db ?? (await getAppDatabase());
    const now = new Date().toISOString();
    const result = await database
        .updateTable('classification_sync')
        .set({
            status: 'pending',
            batchId: null,
            updatedAt: now,
        })
        .where('status', '=', 'syncing')
        .executeTakeFirst();
    return Number(result.numUpdatedRows ?? 0);
}

export async function claimClassificationBatch(
    batchId: string,
    limit: number,
    db?: AppDatabaseClient,
): Promise<ClassificationSyncRow[]> {
    const database = db ?? (await getAppDatabase());
    return await database.transaction().execute(async (trx) => {
        const claimed = await listPendingClassificationSync(limit, trx);
        if (claimed.length === 0) {
            return [];
        }
        const now = new Date().toISOString();
        const ids = claimed.map((row) => row.transactionId);
        await trx
            .updateTable('classification_sync')
            .set({
                status: 'syncing',
                batchId,
                attemptCount: (eb) => eb('attemptCount', '+', 1),
                updatedAt: now,
            })
            .where('transactionId', 'in', ids)
            .where('status', '=', 'pending')
            .execute();
        const rows = await trx
            .selectFrom('classification_sync')
            .selectAll()
            .where('batchId', '=', batchId)
            .where('status', '=', 'syncing')
            .orderBy('createdAt', 'asc')
            .execute();
        return rows.map(mapRow);
    });
}

export async function markClassificationBatchSynced(batchId: string, db?: AppDatabaseClient): Promise<void> {
    const database = db ?? (await getAppDatabase());
    const now = new Date().toISOString();
    await database
        .updateTable('classification_sync')
        .set({
            status: 'synced',
            lastError: null,
            syncedAt: now,
            updatedAt: now,
        })
        .where('batchId', '=', batchId)
        .where('status', '=', 'syncing')
        .execute();
}

export async function markClassificationBatchFailed(
    batchId: string,
    lastError: string,
    db?: AppDatabaseClient,
): Promise<void> {
    const database = db ?? (await getAppDatabase());
    const now = new Date().toISOString();
    await database
        .updateTable('classification_sync')
        .set({
            status: 'failed',
            lastError,
            updatedAt: now,
        })
        .where('batchId', '=', batchId)
        .where('status', '=', 'syncing')
        .execute();
}

export async function revertClassificationBatchToPending(batchId: string, db?: AppDatabaseClient): Promise<void> {
    const database = db ?? (await getAppDatabase());
    const now = new Date().toISOString();
    await database
        .updateTable('classification_sync')
        .set({
            status: 'pending',
            batchId: null,
            updatedAt: now,
        })
        .where('batchId', '=', batchId)
        .where('status', '=', 'syncing')
        .execute();
}

export async function confirmSyncedAbsentFromPending(
    pendingIds: ReadonlySet<string>,
    db?: AppDatabaseClient,
): Promise<number> {
    const database = db ?? (await getAppDatabase());
    const now = new Date().toISOString();
    const synced = await database
        .selectFrom('classification_sync')
        .select('transactionId')
        .where('status', '=', 'synced')
        .execute();
    const toConfirm = synced.map((row) => row.transactionId).filter((id) => !pendingIds.has(id));
    if (toConfirm.length === 0) {
        return 0;
    }
    await database
        .updateTable('classification_sync')
        .set({
            status: 'confirmed',
            confirmedAt: now,
            updatedAt: now,
        })
        .where('transactionId', 'in', toConfirm)
        .where('status', '=', 'synced')
        .execute();
    return toConfirm.length;
}

export async function deleteConfirmedPresentInPending(
    pendingIds: ReadonlySet<string>,
    db?: AppDatabaseClient,
): Promise<number> {
    if (pendingIds.size === 0) {
        return 0;
    }
    const database = db ?? (await getAppDatabase());
    const confirmed = await database
        .selectFrom('classification_sync')
        .select('transactionId')
        .where('status', '=', 'confirmed')
        .execute();
    const toDelete = confirmed.map((row) => row.transactionId).filter((id) => pendingIds.has(id));
    if (toDelete.length === 0) {
        return 0;
    }
    await database
        .deleteFrom('classification_sync')
        .where('transactionId', 'in', toDelete)
        .where('status', '=', 'confirmed')
        .execute();
    return toDelete.length;
}

type StoredRow = {
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

function mapRow(row: StoredRow): ClassificationSyncRow {
    return {
        transactionId: row.transactionId,
        decision: parseStoredDecision(row.decisionJson, row.transactionId),
        status: row.status,
        batchId: row.batchId,
        attemptCount: row.attemptCount,
        lastError: row.lastError,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        syncedAt: row.syncedAt,
        confirmedAt: row.confirmedAt,
    };
}

function parseStoredDecision(raw: string, transactionId: string): ClassificationDecision {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw) as unknown;
    } catch {
        throw new Error(`classification_sync.decision_json is not JSON for ${transactionId}`);
    }
    if (!parsed || typeof parsed !== 'object') {
        throw new Error(`classification_sync.decision_json is invalid for ${transactionId}`);
    }
    const record = parsed as ClassificationDecision;
    if (record.kind === 'category' && typeof record.categoryId === 'string' && record.categoryId) {
        return record.payeeName
            ? { kind: 'category', categoryId: record.categoryId, payeeName: record.payeeName }
            : { kind: 'category', categoryId: record.categoryId };
    }
    if (record.kind === 'split' && Array.isArray(record.lines) && record.lines.length > 0) {
        return record.payeeName ? { kind: 'split', lines: record.lines, payeeName: record.payeeName } : record;
    }
    throw new Error(`classification_sync.decision_json has an unknown shape for ${transactionId}`);
}
