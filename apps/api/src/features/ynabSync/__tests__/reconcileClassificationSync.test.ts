import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AppDatabaseClient } from '../../../data-persistence/database';
import { createTestAppDatabase } from '../../../data-persistence/testDatabase';
import {
    claimClassificationBatch,
    enqueueClassificationDecision,
    getClassificationSync,
    markClassificationBatchSynced,
} from '../data/classificationSyncRepo';
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

        const stillStale = await reconcileClassificationSync(['tx-1', 'tx-other'], database);
        expect(stillStale.has('tx-1')).toBe(true);
        expect(await getClassificationSync('tx-1', database)).toMatchObject({ status: 'synced' });

        const caughtUp = await reconcileClassificationSync(['tx-other'], database);
        expect(caughtUp.has('tx-1')).toBe(false);
        expect(await getClassificationSync('tx-1', database)).toMatchObject({ status: 'confirmed' });
    });

    it('re-queues a confirmed id when the pending set includes it again', async () => {
        await enqueueClassificationDecision('tx-1', { kind: 'category', categoryId: 'cat-1' }, database);
        await claimClassificationBatch('batch-1', 10, database);
        await markClassificationBatchSynced('batch-1', database);
        await reconcileClassificationSync([], database);

        const excluded = await reconcileClassificationSync(['tx-1'], database);
        expect(excluded.has('tx-1')).toBe(false);
        expect(await getClassificationSync('tx-1', database)).toBeUndefined();
    });
});
