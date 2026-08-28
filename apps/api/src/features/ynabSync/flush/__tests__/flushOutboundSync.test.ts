import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AppDatabaseClient } from '../../../../data-persistence/database';
import { createAppDatabase } from '../../../../data-persistence/database';
import { migrateToLatest } from '../../../../data-persistence/migrate';
import { enqueueClassificationDecision, getClassificationSync } from '../../data/classificationSyncRepo';
import { flushOutboundSync, resetOutboundFlushClockForTests } from '../flushOutboundSync';
import { YnabRateLimitError } from '../ynabRateLimit';
import type { YnabTransactionsWriter } from '../ynabWriteClient';

describe('flushOutboundSync', () => {
    let directory: string;
    let database: AppDatabaseClient;

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), 'api-sqlite-'));
        database = createAppDatabase(join(directory, 'app.sqlite'));
        await migrateToLatest(database);
        resetOutboundFlushClockForTests();
    });

    afterEach(async () => {
        await database.destroy();
        await rm(directory, { recursive: true, force: true });
    });

    it('patches a pending batch and marks it synced', async () => {
        await enqueueClassificationDecision('tx-1', { kind: 'category', categoryId: 'cat-1' }, database);
        await enqueueClassificationDecision('tx-2', { kind: 'category', categoryId: 'cat-2' }, database);
        const sent: string[] = [];
        const result = await flushOutboundSync({
            db: database,
            batchSize: 25,
            minIntervalMs: 0,
            now: () => 1_000,
            writer: writer((ids) => {
                sent.push(...ids);
            }),
        });
        expect(result).toEqual({ attempted: 2, synced: 2, failed: 0, skipped: false });
        expect(sent).toEqual(['tx-1', 'tx-2']);
        expect(await getClassificationSync('tx-1', database)).toMatchObject({ status: 'synced' });
    });

    it('honors batch size', async () => {
        await enqueueClassificationDecision('tx-1', { kind: 'category', categoryId: 'cat-1' }, database);
        await enqueueClassificationDecision('tx-2', { kind: 'category', categoryId: 'cat-2' }, database);
        const result = await flushOutboundSync({
            db: database,
            batchSize: 1,
            minIntervalMs: 0,
            now: () => 1_000,
            writer: writer(() => undefined),
        });
        expect(result.synced).toBe(1);
        expect(await getClassificationSync('tx-2', database)).toMatchObject({ status: 'pending' });
    });

    it('reverts the batch to pending on 429', async () => {
        await enqueueClassificationDecision('tx-1', { kind: 'category', categoryId: 'cat-1' }, database);
        const result = await flushOutboundSync({
            db: database,
            minIntervalMs: 0,
            now: () => 1_000,
            writer: {
                updateTransactions: async () => {
                    throw new YnabRateLimitError(60_000);
                },
            },
        });
        expect(result).toMatchObject({ skipped: true, skipReason: 'rate_limit' });
        expect(await getClassificationSync('tx-1', database)).toMatchObject({ status: 'pending' });
    });

    it('skips when the min interval has not elapsed', async () => {
        await enqueueClassificationDecision('tx-1', { kind: 'category', categoryId: 'cat-1' }, database);
        await enqueueClassificationDecision('tx-2', { kind: 'category', categoryId: 'cat-2' }, database);
        await flushOutboundSync({
            db: database,
            batchSize: 1,
            minIntervalMs: 30_000,
            now: () => 1_000,
            writer: writer(() => undefined),
        });
        const second = await flushOutboundSync({
            db: database,
            batchSize: 1,
            minIntervalMs: 30_000,
            now: () => 10_000,
            writer: writer(() => undefined),
        });
        expect(second).toMatchObject({ skipped: true, skipReason: 'min_interval' });
        expect(await getClassificationSync('tx-2', database)).toMatchObject({ status: 'pending' });
    });
});

function writer(onIds: (ids: string[]) => void): YnabTransactionsWriter {
    return {
        updateTransactions: async (transactions) => {
            onIds(transactions.map((transaction) => transaction.id));
        },
    };
}
