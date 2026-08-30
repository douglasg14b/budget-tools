import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppDatabaseClient } from '../../../data-persistence/database';
import { createAppDatabase } from '../../../data-persistence/database';
import { migrateToLatest } from '../../../data-persistence/migrate';
import { setOperatingMode } from '../../operatingMode/data/operatingModeRepo';
import { createReceipt } from '../createReceipt';
import { getReceiptById } from '../data/receiptsRepo';
import { extractStoredReceipt } from '../extractStoredReceipt';
import { jpegDataUrl } from '../pipeline/prepReceiptImage';

describe('extractStoredReceipt', () => {
    let directory: string;
    let database: AppDatabaseClient;
    const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), 'api-receipt-extract-'));
        database = createAppDatabase(join(directory, 'app.sqlite'));
        await migrateToLatest(database);
        await setOperatingMode('live', database);
    });

    afterEach(async () => {
        await database.destroy();
        await rm(directory, { recursive: true, force: true });
    });

    it('persists gated extract keys on the Live row', async () => {
        const created = await createReceipt(
            { frames: [jpegDataUrl(jpegBytes)], receiptsDir: join(directory, 'files') },
            database,
        );
        await extractStoredReceipt(created.id, database, async () => ({
            kind: 'complete',
            extractStatus: 'gated',
            vendor: 'Cafe Rio',
            purchaseDate: '2026-08-01',
            printedMilliunits: 8120,
            totalsDisagree: false,
            extractJson: '{"gated":true}',
            rawText: 'Cafe Rio',
        }));
        const row = await getReceiptById(created.id, database);
        expect(row).toMatchObject({
            extractStatus: 'gated',
            vendor: 'Cafe Rio',
            purchaseDate: '2026-08-01',
            printedMilliunits: 8120,
            totalsDisagree: false,
            rawText: 'Cafe Rio',
        });
        await access(created.originalPath);
    });

    it('deletes the file and row when extract identifies Amazon', async () => {
        const created = await createReceipt(
            {
                frames: [jpegDataUrl(jpegBytes)],
                transactionId: 'txn-amazon',
                receiptsDir: join(directory, 'files'),
            },
            database,
        );
        await extractStoredReceipt(created.id, database, async () => ({ kind: 'amazon' }));
        expect(await getReceiptById(created.id, database)).toBeUndefined();
        await expect(access(created.originalPath)).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('does not persist failed when Amazon delete fails', async () => {
        const created = await createReceipt(
            { frames: [jpegDataUrl(jpegBytes)], receiptsDir: join(directory, 'files') },
            database,
        );
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            await extractStoredReceipt(
                created.id,
                database,
                async () => ({ kind: 'amazon' }),
                async () => {
                    throw new Error('disk full');
                },
            );
            const row = await getReceiptById(created.id, database);
            expect(row).toBeDefined();
            expect(row?.extractStatus).toBe('pending');
            await access(created.originalPath);
            const logged = errorSpy.mock.calls.map((call) => JSON.stringify(call)).join(' ');
            expect(logged).toContain(created.id);
            expect(logged).toContain('receipt amazon delete failed');
            expect(logged).not.toContain('receipt extract status persist failed');
        } finally {
            errorSpy.mockRestore();
        }
    });

    it('persists failed status with the error dump when extract throws', async () => {
        const created = await createReceipt(
            { frames: [jpegDataUrl(jpegBytes)], receiptsDir: join(directory, 'files') },
            database,
        );
        await extractStoredReceipt(created.id, database, async () => {
            throw new Error('OpenRouter request timed out');
        });
        const row = await getReceiptById(created.id, database);
        expect(row?.extractStatus).toBe('failed');
        expect(row?.vendor).toBeNull();
        expect(row?.extractJson).toContain('OpenRouter request timed out');
    });
});
