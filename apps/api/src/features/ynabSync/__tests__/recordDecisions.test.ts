import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AppDatabaseClient } from '../../../data-persistence/database';
import { createTestAppDatabase } from '../../../data-persistence/testDatabase';
import { HttpError } from '../../travelWindows/HttpError';
import { getClassificationSync } from '../data/classificationSyncRepo';
import { recordDecisions } from '../recordDecisions';
import { retractDecision } from '../retractDecision';

describe('recordDecisions', () => {
    let appDb: Awaited<ReturnType<typeof createTestAppDatabase>>;
    let database: AppDatabaseClient;

    beforeEach(async () => {
        appDb = await createTestAppDatabase();
        database = appDb.db;
    });

    afterEach(async () => {
        await appDb.close();
    });

    it('refuses practice mode without writing rows', async () => {
        await expect(
            recordDecisions([categoryBody()], {
                db: database,
                requireLive: async () => {
                    throw new HttpError(403, 'YNAB writes are disabled in practice mode');
                },
                loadTransactions: async () => [{ id: 'tx-1', amount: -1000 }],
                loadAssignableCategoryIds: async () => new Set(['cat-1']),
                onEnqueued: () => undefined,
            }),
        ).rejects.toMatchObject({ statusCode: 403 });
        expect(await getClassificationSync('tx-1', database)).toBeUndefined();
    });

    it('enqueues a live category decision', async () => {
        let kicked = 0;
        const result = await recordDecisions(
            [categoryBody()],
            liveContext(database, () => {
                kicked += 1;
            }),
        );
        expect(result).toEqual({ accepted: 1, pendingCount: 1 });
        expect(kicked).toBe(1);
        expect(await getClassificationSync('tx-1', database)).toMatchObject({
            status: 'pending',
            decision: { kind: 'category', categoryId: 'cat-1', payeeName: 'Costco' },
        });
    });

    it('404s when the transaction is missing', async () => {
        await expect(
            recordDecisions([categoryBody()], {
                ...liveContext(database),
                loadTransactions: async () => [],
            }),
        ).rejects.toMatchObject({ statusCode: 404 });
    });
});

describe('retractDecision', () => {
    let appDb: Awaited<ReturnType<typeof createTestAppDatabase>>;
    let database: AppDatabaseClient;

    beforeEach(async () => {
        appDb = await createTestAppDatabase();
        database = appDb.db;
    });

    afterEach(async () => {
        await appDb.close();
    });

    it('deletes a pending live row', async () => {
        await recordDecisions([categoryBody()], liveContext(database));
        await retractDecision('tx-1', {
            db: database,
            requireLive: async () => undefined,
        });
        expect(await getClassificationSync('tx-1', database)).toBeUndefined();
    });
});

function categoryBody() {
    return { transactionId: 'tx-1', kind: 'category' as const, categoryId: 'cat-1', payeeName: 'Costco' };
}

function liveContext(database: AppDatabaseClient, onEnqueued?: () => void) {
    return {
        db: database,
        requireLive: async () => undefined,
        loadTransactions: async () => [{ id: 'tx-1', amount: -1000 }],
        loadAssignableCategoryIds: async () => new Set(['cat-1']),
        onEnqueued: onEnqueued ?? (() => undefined),
    };
}
