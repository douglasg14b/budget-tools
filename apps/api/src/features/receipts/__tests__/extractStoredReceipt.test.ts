import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppDatabaseClient } from '../../../data-persistence/database';
import { createTestAppDatabase } from '../../../data-persistence/testDatabase';
import { setOperatingMode } from '../../operatingMode/data/operatingModeRepo';
import { createReceipt } from '../createReceipt';
import { getReceiptById } from '../data/receiptsRepo';
import { extractStoredReceipt } from '../extractStoredReceipt';
import { jpegDataUrl } from '../pipeline/prepReceiptImage';
import { originalRef } from '../storage/receiptStorage';

describe('extractStoredReceipt', () => {
    let appDb: Awaited<ReturnType<typeof createTestAppDatabase>>;
    let database: AppDatabaseClient;
    const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

    beforeEach(async () => {
        appDb = await createTestAppDatabase();
        database = appDb.db;
        await setOperatingMode('live', database);
    });

    afterEach(async () => {
        await appDb.close();
    });

    it('persists gated extract keys on the Live row', async () => {
        const created = await createReceipt(
            { frames: [jpegDataUrl(jpegBytes)], receiptsDir: appDb.receiptsDir },
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
        expect(await appDb.storage.exists(originalRef(created.id, 0))).toBe(true);
    });

    it('deletes the file and row when extract identifies Amazon', async () => {
        const created = await createReceipt(
            {
                frames: [jpegDataUrl(jpegBytes)],
                transactionId: 'txn-amazon',
                receiptsDir: appDb.receiptsDir,
            },
            database,
        );
        await extractStoredReceipt(created.id, database, async () => ({ kind: 'amazon' }));
        expect(await getReceiptById(created.id, database)).toBeUndefined();
        expect(await appDb.storage.exists(originalRef(created.id, 0))).toBe(false);
    });

    it('does not persist failed when Amazon delete fails', async () => {
        const created = await createReceipt(
            { frames: [jpegDataUrl(jpegBytes)], receiptsDir: appDb.receiptsDir },
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
            expect(await appDb.storage.exists(originalRef(created.id, 0))).toBe(true);
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
            { frames: [jpegDataUrl(jpegBytes)], receiptsDir: appDb.receiptsDir },
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

    it('extracts the processed image when it is stored', async () => {
        const processed = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x33]);
        const created = await createReceipt(
            {
                frames: [jpegDataUrl(jpegBytes)],
                processed: jpegDataUrl(processed),
                receiptsDir: appDb.receiptsDir,
            },
            database,
        );
        let seen: Buffer | undefined;
        await extractStoredReceipt(created.id, database, async ({ frames }) => {
            seen = frames[0];
            return {
                kind: 'complete',
                extractStatus: 'ungated',
                vendor: 'Store',
                purchaseDate: '2026-08-01',
                printedMilliunits: 1000,
                totalsDisagree: false,
                extractJson: '{}',
                rawText: 'Store',
            };
        });
        expect(seen?.equals(processed)).toBe(true);
        expect(seen?.equals(jpegBytes)).toBe(false);
    });
});
