import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AppDatabaseClient } from '../../../data-persistence/database';
import { createAppDatabase } from '../../../data-persistence/database';
import { migrateToLatest } from '../../../data-persistence/migrate';
import { setOperatingMode } from '../../operatingMode/data/operatingModeRepo';
import { insertReceiptOriginal, requireReceipt, setReceiptExtract } from '../data/receiptsRepo';
import { patchReceipt } from '../patchReceipt';

const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

const gatedEdit = {
    vendor: 'Cafe Rio',
    purchaseDate: '2026-08-01',
    printedMilliunits: 8120,
    taxMilliunits: 620,
    discountMilliunits: 200,
    lines: [
        { name: 'Latte', amountMilliunits: 4500, quantity: 1 },
        { name: 'Muffin', amountMilliunits: 3200, quantity: 1 },
    ],
};

describe('patchReceipt', () => {
    let directory: string;
    let database: AppDatabaseClient;

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), 'api-receipts-patch-'));
        database = createAppDatabase(join(directory, 'app.sqlite'));
        await migrateToLatest(database);
    });

    afterEach(async () => {
        await database.destroy();
        await rm(directory, { recursive: true, force: true });
    });

    it('writes gated extract in Live and refuses Amazon vendor', async () => {
        await setOperatingMode('live', database);
        const created = await insertReceiptOriginal(
            { bytes: jpegBytes, receiptsDir: join(directory, 'files') },
            database,
        );
        await setReceiptExtract(
            created.id,
            {
                extractStatus: 'ungated',
                extractJson: '{"error":"old"}',
                rawText: 'old',
                vendor: 'Unknown',
                purchaseDate: '2026-07-01',
                printedMilliunits: 1,
                totalsDisagree: true,
            },
            database,
        );

        const patched = await patchReceipt(created.id, gatedEdit, database);
        expect(patched.extractStatus).toBe('gated');
        expect(patched.vendor).toBe('Cafe Rio');
        expect(patched.totalsDisagree).toBe(false);
        expect(patched.transactionId).toBeNull();

        await expect(patchReceipt(created.id, { ...gatedEdit, vendor: 'Amazon.com' }, database)).rejects.toMatchObject({
            statusCode: 400,
        });
        const unchanged = await requireReceipt(created.id, database);
        expect(unchanged.vendor).toBe('Cafe Rio');
    });

    it('refuses pending extract and Practice writes', async () => {
        await setOperatingMode('live', database);
        const created = await insertReceiptOriginal(
            { bytes: jpegBytes, receiptsDir: join(directory, 'files') },
            database,
        );
        await expect(patchReceipt(created.id, gatedEdit, database)).rejects.toMatchObject({ statusCode: 409 });

        await setReceiptExtract(
            created.id,
            {
                extractStatus: 'failed',
                extractJson: '{}',
                rawText: null,
                vendor: null,
                purchaseDate: null,
                printedMilliunits: null,
                totalsDisagree: false,
            },
            database,
        );
        await setOperatingMode('practice', database);
        await expect(patchReceipt(created.id, gatedEdit, database)).rejects.toMatchObject({ statusCode: 403 });
    });
});
