import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AppDatabaseClient } from '../../../../data-persistence/database';
import { createAppDatabase } from '../../../../data-persistence/database';
import { migrateToLatest } from '../../../../data-persistence/migrate';
import { ConflictError } from '../../../travelWindows/HttpError';
import type { ClassificationDecision } from '../../classificationDecision';
import {
    claimClassificationBatch,
    confirmSyncedAbsentFromPending,
    deleteConfirmedPresentInPending,
    deleteRetractableClassification,
    enqueueClassificationDecision,
    getClassificationSync,
    listExcludedTransactionIds,
    markClassificationBatchFailed,
    markClassificationBatchSynced,
    resumeStaleSyncing,
    revertClassificationBatchToPending,
} from '../classificationSyncRepo';

describe('classificationSyncRepo', () => {
    let directory: string;
    let database: AppDatabaseClient;

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), 'api-sqlite-'));
        database = createAppDatabase(join(directory, 'app.sqlite'));
        await migrateToLatest(database);
    });

    afterEach(async () => {
        await database.destroy();
        await rm(directory, { recursive: true, force: true });
    });

    it('enqueues a decision and replaces pending or failed rows', async () => {
        await enqueueClassificationDecision('tx-1', category('cat-a'), database);
        await enqueueClassificationDecision('tx-1', category('cat-b'), database);
        expect(await getClassificationSync('tx-1', database)).toMatchObject({
            transactionId: 'tx-1',
            status: 'pending',
            decision: category('cat-b'),
        });

        await database
            .updateTable('classification_sync')
            .set({ status: 'failed', lastError: 'boom' })
            .where('transactionId', '=', 'tx-1')
            .execute();
        await enqueueClassificationDecision('tx-1', splitDecision(), database);
        expect(await getClassificationSync('tx-1', database)).toMatchObject({
            status: 'pending',
            decision: splitDecision(),
            lastError: null,
        });
    });

    it('refuses to replace syncing or synced rows', async () => {
        await enqueueClassificationDecision('tx-1', category('cat-a'), database);
        const [claimed] = await claimClassificationBatch('batch-1', 10, database);
        expect(claimed?.status).toBe('syncing');
        await expect(enqueueClassificationDecision('tx-1', category('cat-b'), database)).rejects.toBeInstanceOf(
            ConflictError,
        );

        await markClassificationBatchSynced('batch-1', database);
        await expect(enqueueClassificationDecision('tx-1', category('cat-b'), database)).rejects.toBeInstanceOf(
            ConflictError,
        );
    });

    it('deletes pending and failed rows but not synced ones', async () => {
        await enqueueClassificationDecision('tx-1', category('cat-a'), database);
        expect(await deleteRetractableClassification('tx-1', database)).toBe('deleted');
        expect(await deleteRetractableClassification('tx-1', database)).toBe('missing');

        await enqueueClassificationDecision('tx-2', category('cat-a'), database);
        await claimClassificationBatch('batch-2', 10, database);
        await markClassificationBatchSynced('batch-2', database);
        await expect(deleteRetractableClassification('tx-2', database)).rejects.toBeInstanceOf(ConflictError);
    });

    it('excludes in-flight and pushed ids, then confirms when they leave pending', async () => {
        await enqueueClassificationDecision('synced-tx', category('cat-a'), database);
        await claimClassificationBatch('batch-3', 10, database);
        await markClassificationBatchSynced('batch-3', database);
        await enqueueClassificationDecision('pending-tx', category('cat-a'), database);

        const excluded = await listExcludedTransactionIds(database);
        expect(excluded.has('pending-tx')).toBe(true);
        expect(excluded.has('synced-tx')).toBe(true);

        expect(await confirmSyncedAbsentFromPending(new Set(['pending-tx']), database)).toBe(1);
        expect(await getClassificationSync('synced-tx', database)).toMatchObject({ status: 'confirmed' });
        expect((await listExcludedTransactionIds(database)).has('synced-tx')).toBe(false);
    });

    it('drops a confirmed row when the mirror shows it pending again', async () => {
        await enqueueClassificationDecision('tx-1', category('cat-a'), database);
        await claimClassificationBatch('batch-4', 10, database);
        await markClassificationBatchSynced('batch-4', database);
        await confirmSyncedAbsentFromPending(new Set(), database);
        expect(await deleteConfirmedPresentInPending(new Set(['tx-1']), database)).toBe(1);
        expect(await getClassificationSync('tx-1', database)).toBeUndefined();
    });

    it('reverts a syncing batch to pending and resumes stale syncing rows', async () => {
        await enqueueClassificationDecision('tx-1', category('cat-a'), database);
        await claimClassificationBatch('batch-5', 10, database);
        await revertClassificationBatchToPending('batch-5', database);
        expect(await getClassificationSync('tx-1', database)).toMatchObject({ status: 'pending', batchId: null });

        await claimClassificationBatch('batch-6', 10, database);
        expect(await resumeStaleSyncing(database)).toBe(1);
        expect(await getClassificationSync('tx-1', database)).toMatchObject({ status: 'pending' });
    });

    it('marks a claimed batch failed', async () => {
        await enqueueClassificationDecision('tx-1', category('cat-a'), database);
        await claimClassificationBatch('batch-7', 10, database);
        await markClassificationBatchFailed('batch-7', 'YNAB 400', database);
        expect(await getClassificationSync('tx-1', database)).toMatchObject({
            status: 'failed',
            lastError: 'YNAB 400',
        });
    });
});

function category(categoryId: string): ClassificationDecision {
    return { kind: 'category', categoryId };
}

function splitDecision(): ClassificationDecision {
    return {
        kind: 'split',
        lines: [
            { amount: -400, categoryId: 'cat-1', memo: 'Milk' },
            { amount: -600, categoryId: 'cat-2', memo: null },
        ],
    };
}
