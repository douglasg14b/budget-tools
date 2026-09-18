import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppDatabaseClient } from '../../../data-persistence/database';
import { createTestAppDatabase } from '../../../data-persistence/testDatabase';
import type { TransactionDetailDto } from '../../categorization/categorizationDtos';
import { setOperatingMode } from '../../operatingMode/data/operatingModeRepo';
import { getReceiptById, insertReceiptOriginal, setReceiptExtract } from '../data/receiptsRepo';
import { sweepUnboundReceiptBindings } from '../sweepUnboundReceiptBindings';

describe('sweepUnboundReceiptBindings', () => {
    let appDb: Awaited<ReturnType<typeof createTestAppDatabase>>;
    let database: AppDatabaseClient;

    beforeEach(async () => {
        appDb = await createTestAppDatabase();
        database = appDb.db;
        await setOperatingMode('live', database);
    });

    afterEach(async () => {
        await appDb.close();
    });

    it('binds a completed unbound receipt when its bank transaction arrives later', async () => {
        const receipt = await readyReceipt();
        const bound = await sweepUnboundReceiptBindings(database, undefined, async () => [transaction()]);

        expect(bound).toBe(1);
        expect((await getReceiptById(receipt.id, database))?.transactionId).toBe('txn-1');
    });

    it('leaves ambiguous exact matches unbound', async () => {
        const receipt = await readyReceipt();
        const bound = await sweepUnboundReceiptBindings(database, undefined, async () => [
            transaction(),
            transaction({ id: 'txn-2' }),
        ]);

        expect(bound).toBe(0);
        expect((await getReceiptById(receipt.id, database))?.transactionId).toBeNull();
    });

    it('does not query or bind in Practice', async () => {
        await setOperatingMode('practice', database);
        const listTransactions = vi.fn(async () => [transaction()]);

        await expect(sweepUnboundReceiptBindings(database, undefined, listTransactions)).resolves.toBe(0);
        expect(listTransactions).not.toHaveBeenCalled();
    });

    async function readyReceipt() {
        const receipt = await insertReceiptOriginal(
            {
                bytes: await sharp({
                    create: {
                        width: 1,
                        height: 1,
                        channels: 3,
                        background: { r: 0, g: 0, b: 0 },
                    },
                })
                    .jpeg()
                    .toBuffer(),
                receiptsDir: appDb.receiptsDir,
            },
            database,
        );
        await setReceiptExtract(
            receipt.id,
            {
                extractStatus: 'gated',
                extractJson: null,
                rawText: null,
                vendor: 'Starbucks',
                purchaseDate: '2026-02-09',
                printedMilliunits: -50000,
                totalsDisagree: false,
            },
            database,
        );
        return receipt;
    }
});

function transaction(overrides: Partial<TransactionDetailDto> = {}): TransactionDetailDto {
    return {
        id: 'txn-1',
        date: '2026-02-10',
        amount: -50000,
        memo: null,
        cleared: 'cleared',
        approved: true,
        accountId: 'acct',
        accountName: 'Checking',
        payeeId: 'payee',
        payeeName: 'Starbucks',
        categoryId: null,
        categoryName: null,
        importId: null,
        importPayeeName: 'STARBUCKS',
        importPayeeNameOriginal: null,
        ...overrides,
    };
}
