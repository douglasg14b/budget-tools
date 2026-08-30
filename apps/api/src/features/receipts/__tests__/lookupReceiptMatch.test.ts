import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AppDatabaseClient } from '../../../data-persistence/database';
import { createAppDatabase } from '../../../data-persistence/database';
import { migrateToLatest } from '../../../data-persistence/migrate';
import { setOperatingMode } from '../../operatingMode/data/operatingModeRepo';
import { insertReceiptOriginal } from '../data/receiptsRepo';
import { lookupByReceipt, lookupByTransaction, matchPreview, toReceiptMatchDto } from '../lookupReceiptMatch';

describe('matchPreview', () => {
    it('matches ephemeral receipts and writes nothing', async () => {
        const result = await matchPreview({
            receipts: [
                {
                    id: 'rcp-1',
                    vendor: 'Starbucks',
                    purchaseDate: '2026-02-09',
                    printedMilliunits: -50000,
                    totalsDisagree: false,
                },
            ],
            transaction: {
                id: 'txn-1',
                date: '2026-02-10',
                amount: -50000,
                payeeName: 'Starbucks',
                importPayeeName: 'STARBUCKS',
                importPayeeNameOriginal: null,
            },
        });
        expect(toReceiptMatchDto(result)).toMatchObject({
            amazonSkipped: false,
            autoBind: true,
            exactReceiptId: 'rcp-1',
            exactTransactionId: 'txn-1',
        });
    });

    it('rejects empty receipts and mixed transaction sources', async () => {
        await expect(matchPreview({ receipts: [] })).rejects.toMatchObject({ statusCode: 400 });
        await expect(
            matchPreview({
                receipts: [
                    {
                        id: 'rcp-1',
                        vendor: 'Starbucks',
                        purchaseDate: '2026-02-09',
                        printedMilliunits: -50000,
                        totalsDisagree: false,
                    },
                ],
            }),
        ).rejects.toMatchObject({ statusCode: 400 });
        await expect(
            matchPreview({
                receipts: [
                    {
                        id: 'rcp-1',
                        vendor: 'Starbucks',
                        purchaseDate: '2026-02-09',
                        printedMilliunits: -50000,
                        totalsDisagree: false,
                    },
                ],
                transactionId: 'txn-1',
                transaction: {
                    id: 'txn-1',
                    date: '2026-02-10',
                    amount: -50000,
                    payeeName: 'Starbucks',
                    importPayeeName: null,
                    importPayeeNameOriginal: null,
                },
            }),
        ).rejects.toMatchObject({ statusCode: 400 });
    });
});

describe('lookupByTransaction', () => {
    let directory: string;
    let database: AppDatabaseClient;

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), 'api-receipts-lookup-'));
        database = createAppDatabase(join(directory, 'app.sqlite'));
        await migrateToLatest(database);
    });

    afterEach(async () => {
        await database.destroy();
        await rm(directory, { recursive: true, force: true });
    });

    it('refuses Practice Live SQLite lookup', async () => {
        await setOperatingMode('practice', database);
        await expect(lookupByTransaction('txn-1', database)).rejects.toMatchObject({ statusCode: 403 });
        await expect(lookupByReceipt('rcp-1', database)).rejects.toMatchObject({ statusCode: 403 });
    });

    it('returns no bank candidates when the receipt has no purchase date', async () => {
        await setOperatingMode('live', database);
        const created = await insertReceiptOriginal(
            { bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), receiptsDir: join(directory, 'files') },
            database,
        );
        const result = await lookupByReceipt(created.id, database);
        expect(result.autoBind).toBe(false);
        expect(result.closeMatches).toEqual([]);
        expect(result.exactTransactionId).toBeNull();
    });
});
