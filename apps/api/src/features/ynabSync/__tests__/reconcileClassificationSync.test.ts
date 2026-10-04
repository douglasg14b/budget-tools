import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AppDatabaseClient } from '../../../data-persistence/database';
import { createTestAppDatabase } from '../../../data-persistence/testDatabase';
import {
    claimClassificationBatch,
    enqueueClassificationDecision,
    getClassificationSync,
    markClassificationBatchSynced,
} from '../data/classificationSyncRepo';
import type { PendingTransactionMirror } from '../reconcileClassificationSync';
import { reconcileClassificationSync } from '../reconcileClassificationSync';

describe('reconcileClassificationSync', () => {
    let appDb: Awaited<ReturnType<typeof createTestAppDatabase>>;
    let database: AppDatabaseClient;

    beforeEach(async () => {
        appDb = await createTestAppDatabase();
        database = appDb.db;
    });

    afterEach(async () => {
        await appDb.close();
    });

    it('keeps synced ids excluded until the pending set no longer includes them', async () => {
        await enqueueClassificationDecision('tx-1', { kind: 'category', categoryId: 'cat-1' }, database);
        await claimClassificationBatch('batch-1', 10, database);
        await markClassificationBatchSynced('batch-1', database);

        const stillStale = await reconcileClassificationSync([mirror('tx-1'), mirror('tx-other')], database);
        expect(stillStale.has('tx-1')).toBe(true);
        expect(await getClassificationSync('tx-1', database)).toMatchObject({ status: 'synced' });

        const caughtUp = await reconcileClassificationSync([mirror('tx-other')], database);
        expect(caughtUp.has('tx-1')).toBe(false);
        expect(await getClassificationSync('tx-1', database)).toMatchObject({ status: 'confirmed' });
    });

    it('re-queues a confirmed id when the pending set includes it again', async () => {
        await enqueueClassificationDecision('tx-1', { kind: 'category', categoryId: 'cat-1' }, database);
        await claimClassificationBatch('batch-1', 10, database);
        await markClassificationBatchSynced('batch-1', database);
        await reconcileClassificationSync([], database);

        const excluded = await reconcileClassificationSync([mirror('tx-1')], database);
        expect(excluded.has('tx-1')).toBe(false);
        expect(await getClassificationSync('tx-1', database)).toBeUndefined();
    });

    it('keeps annotated transactions in the queue while pending, syncing, and synced', async () => {
        await enqueueClassificationDecision('tx-1', { kind: 'annotate', flagColor: 'red', approved: false }, database);
        expect((await reconcileClassificationSync([mirror('tx-1')], database)).has('tx-1')).toBe(false);

        await claimClassificationBatch('batch-1', 10, database);
        expect((await reconcileClassificationSync([mirror('tx-1')], database)).has('tx-1')).toBe(false);

        await markClassificationBatchSynced('batch-1', database);
        expect((await reconcileClassificationSync([mirror('tx-1')], database)).has('tx-1')).toBe(false);
        expect(await getClassificationSync('tx-1', database)).toMatchObject({ status: 'synced' });
    });

    it('drops a synced annotation once the mirror shows what was sent', async () => {
        await enqueueClassificationDecision(
            'tx-1',
            { kind: 'annotate', memo: 'Ask Sam', flagColor: 'red', approved: false },
            database,
        );
        await claimClassificationBatch('batch-1', 10, database);
        await markClassificationBatchSynced('batch-1', database);

        await reconcileClassificationSync([{ id: 'tx-1', memo: 'Ask Sam', flagColor: null }], database);
        expect(await getClassificationSync('tx-1', database)).toMatchObject({ status: 'synced' });

        const excluded = await reconcileClassificationSync(
            [{ id: 'tx-1', memo: 'Ask Sam', flagColor: 'red' }],
            database,
        );
        expect(excluded.has('tx-1')).toBe(false);
        expect(await getClassificationSync('tx-1', database)).toBeUndefined();
    });

    it('drops a synced annotation once the transaction leaves the pending set', async () => {
        await enqueueClassificationDecision('tx-1', { kind: 'annotate', flagColor: 'red', approved: true }, database);
        await claimClassificationBatch('batch-1', 10, database);
        await markClassificationBatchSynced('batch-1', database);

        await reconcileClassificationSync([mirror('tx-other')], database);
        expect(await getClassificationSync('tx-1', database)).toBeUndefined();
    });
});

function mirror(id: string): PendingTransactionMirror {
    return { id, memo: null, flagColor: null };
}
