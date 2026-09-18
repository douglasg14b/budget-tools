import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AppDatabaseClient } from '../../../data-persistence/database';
import { createTestAppDatabase } from '../../../data-persistence/testDatabase';
import { setOperatingMode } from '../../operatingMode/data/operatingModeRepo';
import { createReceipt } from '../createReceipt';
import { getReceiptById, setReceiptExtract } from '../data/receiptsRepo';
import { jpegDataUrl } from '../pipeline/prepReceiptImage';
import { retryReceiptExtract } from '../retryReceiptExtract';

describe('retryReceiptExtract', () => {
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

    it('clears a failed extract and returns it to pending', async () => {
        const created = await createReceipt(
            { frames: [jpegDataUrl(jpegBytes)], receiptsDir: appDb.receiptsDir },
            database,
        );
        await setReceiptExtract(
            created.id,
            {
                extractStatus: 'failed',
                extractJson: '{"error":"OPENROUTER_API_KEY is not configured"}',
                rawText: 'incomplete',
                vendor: 'Partial vendor',
                purchaseDate: '2026-09-17',
                printedMilliunits: 1200,
                totalsDisagree: true,
                extractCostUsd: 0.01,
                extractPromptTokens: 100,
                extractCompletionTokens: 20,
            },
            database,
        );

        const retried = await retryReceiptExtract(created.id, database);

        expect(retried).toMatchObject({
            extractStatus: 'pending',
            extractJson: null,
            rawText: null,
            vendor: null,
            purchaseDate: null,
            printedMilliunits: null,
            totalsDisagree: false,
            extractCostUsd: null,
            extractPromptTokens: null,
            extractCompletionTokens: null,
        });
        expect(await getReceiptById(created.id, database)).toMatchObject({ extractStatus: 'pending' });
    });

    it('rejects retrying an extract that is not failed', async () => {
        const created = await createReceipt(
            { frames: [jpegDataUrl(jpegBytes)], receiptsDir: appDb.receiptsDir },
            database,
        );

        await expect(retryReceiptExtract(created.id, database)).rejects.toMatchObject({ statusCode: 409 });
    });

    it('refuses retries in Practice mode', async () => {
        const created = await createReceipt(
            { frames: [jpegDataUrl(jpegBytes)], receiptsDir: appDb.receiptsDir },
            database,
        );
        await setReceiptExtract(
            created.id,
            {
                extractStatus: 'failed',
                extractJson: null,
                rawText: null,
                vendor: null,
                purchaseDate: null,
                printedMilliunits: null,
                totalsDisagree: false,
            },
            database,
        );
        await setOperatingMode('practice', database);

        await expect(retryReceiptExtract(created.id, database)).rejects.toMatchObject({ statusCode: 403 });
    });
});
