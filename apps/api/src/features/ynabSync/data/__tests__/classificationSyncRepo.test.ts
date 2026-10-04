import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AppDatabaseClient } from '../../../../data-persistence/database';
import { createTestAppDatabase } from '../../../../data-persistence/testDatabase';
import { ConflictError } from '../../../travelWindows/HttpError';
import type { ClassificationDecision } from '../../classificationDecision';
import type { YnabFlagColor } from '../../ynabFlagColor';
import {
    claimClassificationBatch,
    confirmSyncedAbsentFromPending,
    deleteConfirmedPresentInPending,
    deleteRetractableClassification,
    deleteSettledAnnotations,
    enqueueClassificationDecision,
    getClassificationSync,
    listExcludedTransactionIds,
    markClassificationBatchFailed,
    markClassificationBatchSynced,
    resumeStaleSyncing,
    revertClassificationBatchToPending,
} from '../classificationSyncRepo';

describe('classificationSyncRepo', () => {
    let appDb: Awaited<ReturnType<typeof createTestAppDatabase>>;
    let database: AppDatabaseClient;

    beforeEach(async () => {
        appDb = await createTestAppDatabase();
        database = appDb.db;
    });

    afterEach(async () => {
        await appDb.close();
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

    it('round-trips memo and flag, keeping absent fields absent and explicit nulls', async () => {
        const decisions: ReadonlyArray<[string, ClassificationDecision]> = [
            [
                'category-set',
                { kind: 'category', categoryId: 'cat-1', payeeName: 'Costco', memo: 'Gift', flagColor: 'red' },
            ],
            ['category-clear', { kind: 'category', categoryId: 'cat-1', memo: null, flagColor: null }],
            ['category-absent', { kind: 'category', categoryId: 'cat-1' }],
            ['split-set', { ...splitDecision(), memo: 'Costco run', flagColor: 'green' } as ClassificationDecision],
            ['split-clear', { ...splitDecision(), memo: null } as ClassificationDecision],
            ['annotate-flag', { kind: 'annotate', flagColor: 'purple', approved: false }],
            ['annotate-memo', { kind: 'annotate', memo: null, approved: true }],
        ];
        for (const [transactionId, decision] of decisions) {
            await enqueueClassificationDecision(transactionId, decision, database);
            expect((await getClassificationSync(transactionId, database))?.decision).toStrictEqual(decision);
        }
    });

    it('fails loud on a stored annotation with a bad flag or no approval', async () => {
        await insertRawDecision('bad-flag', { kind: 'annotate', flagColor: 'pink', approved: true });
        await expect(getClassificationSync('bad-flag', database)).rejects.toThrow(/unknown shape/);
        await insertRawDecision('no-approval', { kind: 'annotate', flagColor: 'red' });
        await expect(getClassificationSync('no-approval', database)).rejects.toThrow(/unknown shape/);
        await insertRawDecision('empty-annotation', { kind: 'annotate', approved: true });
        await expect(getClassificationSync('empty-annotation', database)).rejects.toThrow(/unknown shape/);
    });

    it('lets any later decision replace an annotation in every status', async () => {
        await enqueueClassificationDecision('tx-1', annotate('red'), database);
        await claimClassificationBatch('batch-a', 10, database);
        await markClassificationBatchSynced('batch-a', database);
        await enqueueClassificationDecision('tx-1', annotate('blue'), database);
        expect(await getClassificationSync('tx-1', database)).toMatchObject({
            status: 'pending',
            batchId: null,
            syncedAt: null,
            decision: annotate('blue'),
        });

        await claimClassificationBatch('batch-b', 10, database);
        await markClassificationBatchSynced('batch-b', database);
        await enqueueClassificationDecision('tx-1', category('cat-a'), database);
        expect(await getClassificationSync('tx-1', database)).toMatchObject({
            status: 'pending',
            decision: category('cat-a'),
        });
    });

    it('does not mark a replaced annotation synced when its old batch lands', async () => {
        await enqueueClassificationDecision('tx-1', annotate('red'), database);
        const [claimed] = await claimClassificationBatch('batch-1', 10, database);
        expect(claimed?.status).toBe('syncing');

        await enqueueClassificationDecision('tx-1', category('cat-a'), database);
        await markClassificationBatchSynced('batch-1', database);
        expect(await getClassificationSync('tx-1', database)).toMatchObject({
            status: 'pending',
            batchId: null,
            syncedAt: null,
            decision: category('cat-a'),
        });

        const [reclaimed] = await claimClassificationBatch('batch-2', 10, database);
        expect(reclaimed).toMatchObject({
            transactionId: 'tx-1',
            decision: { ...category('cat-a'), flagColor: 'red' },
        });
    });

    it('carries an unsent annotation into the decision that replaces it', async () => {
        await enqueueClassificationDecision(
            'pending-note',
            { kind: 'annotate', memo: 'Ask Sam', flagColor: 'red', approved: false },
            database,
        );
        await enqueueClassificationDecision('pending-note', { ...category('cat-a'), flagColor: null }, database);
        expect((await getClassificationSync('pending-note', database))?.decision).toEqual({
            ...category('cat-a'),
            memo: 'Ask Sam',
            flagColor: null,
        });

        await enqueueClassificationDecision('synced-note', annotate('red'), database);
        await claimClassificationBatch('batch-a', 10, database);
        await markClassificationBatchSynced('batch-a', database);
        await enqueueClassificationDecision('synced-note', category('cat-a'), database);
        expect((await getClassificationSync('synced-note', database))?.decision).toEqual(category('cat-a'));
    });

    it('retracts a pending annotation', async () => {
        await enqueueClassificationDecision('tx-1', annotate('red'), database);
        expect(await deleteRetractableClassification('tx-1', database)).toBe('deleted');
    });

    it('never excludes or confirms annotations', async () => {
        await enqueueClassificationDecision('synced-note', annotate('red'), database);
        await claimClassificationBatch('batch-n', 10, database);
        await markClassificationBatchSynced('batch-n', database);
        await enqueueClassificationDecision('pending-note', annotate('red'), database);
        await enqueueClassificationDecision('categorized', category('cat-a'), database);

        const excluded = await listExcludedTransactionIds(database);
        expect(excluded.has('pending-note')).toBe(false);
        expect(excluded.has('synced-note')).toBe(false);
        expect(excluded.has('categorized')).toBe(true);

        expect(await confirmSyncedAbsentFromPending(new Set(), database)).toBe(0);
        expect(await getClassificationSync('synced-note', database)).toMatchObject({ status: 'synced' });
    });

    it('deletes synced annotations once mirrored or out of the pending set', async () => {
        await enqueueClassificationDecision(
            'mirrored',
            { kind: 'annotate', memo: 'Ask Sam', approved: false },
            database,
        );
        await enqueueClassificationDecision('stale', annotate('red'), database);
        await enqueueClassificationDecision('left-pending', annotate('red'), database);
        await claimClassificationBatch('batch-s', 10, database);
        await markClassificationBatchSynced('batch-s', database);
        await enqueueClassificationDecision('not-flushed', annotate('red'), database);

        const pending = new Map([
            ['mirrored', { memo: 'Ask Sam', flagColor: 'green' as const }],
            ['stale', { memo: null, flagColor: null }],
            ['not-flushed', { memo: null, flagColor: 'red' as const }],
        ]);
        expect(await deleteSettledAnnotations(pending, database)).toBe(2);
        expect(await getClassificationSync('mirrored', database)).toBeUndefined();
        expect(await getClassificationSync('left-pending', database)).toBeUndefined();
        expect(await getClassificationSync('stale', database)).toMatchObject({ status: 'synced' });
        expect(await getClassificationSync('not-flushed', database)).toMatchObject({ status: 'pending' });
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

    async function insertRawDecision(transactionId: string, decision: Record<string, unknown>): Promise<void> {
        const now = new Date().toISOString();
        await database
            .insertInto('classification_sync')
            .values({
                transactionId,
                decisionJson: JSON.stringify(decision),
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
    }
});

function category(categoryId: string): ClassificationDecision {
    return { kind: 'category', categoryId };
}

function annotate(flagColor: YnabFlagColor): ClassificationDecision {
    return { kind: 'annotate', flagColor, approved: false };
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
