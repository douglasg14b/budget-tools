import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppDatabaseClient } from '../../../data-persistence/database';
import { createTestAppDatabase } from '../../../data-persistence/testDatabase';
import type { TransactionDetailDto } from '../../categorization/categorizationDtos';
import { setOperatingMode } from '../../operatingMode/data/operatingModeRepo';
import type { ConfirmPair } from '../autoBindReceipt';
import { autoBindReceipt, clearAutoBindJevCache } from '../autoBindReceipt';
import {
    getReceiptById,
    insertReceiptOriginal,
    setReceiptExtract,
    setReceiptTransactionId,
} from '../data/receiptsRepo';
import { sweepUnboundReceiptBindings } from '../sweepUnboundReceiptBindings';

describe('receipt auto-binding', () => {
    let appDb: Awaited<ReturnType<typeof createTestAppDatabase>>;
    let database: AppDatabaseClient;

    beforeEach(async () => {
        clearAutoBindJevCache();
        appDb = await createTestAppDatabase();
        database = appDb.db;
        await setOperatingMode('live', database);
    });

    afterEach(async () => {
        await appDb.close();
    });

    function jev(scores: Record<string, number | null>): ConfirmPair & ReturnType<typeof vi.fn> {
        return vi.fn(async (_receipt, transaction: TransactionDetailDto) => scores[transaction.id] ?? null);
    }

    it('binds when Jev confirms the only exact-amount charge, recording source and score', async () => {
        const receipt = await readyReceipt();
        const bound = await sweepUnboundReceiptBindings({
            db: database,
            listTransactions: async () => [transaction()],
            confirm: jev({ 'txn-1': 0.96 }),
        });

        expect(bound).toBe(1);
        expect(await getReceiptById(receipt.id, database)).toMatchObject({
            transactionId: 'txn-1',
            bindSource: 'auto',
            bindJevScore: 0.96,
            bindCheckOutcome: 'bound',
        });
    });

    it('leaves the receipt unbound and records why when Jev declines', async () => {
        const receipt = await readyReceipt();
        await sweepUnboundReceiptBindings({
            db: database,
            listTransactions: async () => [transaction()],
            confirm: jev({ 'txn-1': 0.4 }),
        });

        const row = await getReceiptById(receipt.id, database);
        expect(row).toMatchObject({ transactionId: null, bindCheckOutcome: 'not-confirmed' });
        expect(row?.bindCheckedAt).not.toBeNull();
    });

    it('lets Jev pick between charges that share the exact amount', async () => {
        const receipt = await readyReceipt();
        await sweepUnboundReceiptBindings({
            db: database,
            listTransactions: async () => [transaction(), transaction({ id: 'txn-2', payeeName: 'Shell' })],
            confirm: jev({ 'txn-1': 0.95, 'txn-2': 0.05 }),
        });

        expect((await getReceiptById(receipt.id, database))?.transactionId).toBe('txn-1');
    });

    it('stays unbound when Jev confirms more than one charge', async () => {
        const receipt = await readyReceipt();
        await sweepUnboundReceiptBindings({
            db: database,
            listTransactions: async () => [transaction(), transaction({ id: 'txn-2' })],
            confirm: jev({ 'txn-1': 0.95, 'txn-2': 0.95 }),
        });

        expect(await getReceiptById(receipt.id, database)).toMatchObject({
            transactionId: null,
            bindCheckOutcome: 'ambiguous',
        });
    });

    it('fails closed when Jev has no key or cannot be reached', async () => {
        const receipt = await readyReceipt();
        const deps = { db: database, listTransactions: async () => [transaction()] };

        await sweepUnboundReceiptBindings({ ...deps, confirm: null });
        expect((await getReceiptById(receipt.id, database))?.bindCheckOutcome).toBe('jev-unavailable');

        await sweepUnboundReceiptBindings({
            ...deps,
            confirm: async () => {
                throw new Error('decisions 503');
            },
        });
        expect(await getReceiptById(receipt.id, database)).toMatchObject({
            transactionId: null,
            bindCheckOutcome: 'jev-unavailable',
        });
    });

    it('treats a missing Jev answer as unavailable and asks again next sweep', async () => {
        const receipt = await readyReceipt();
        const confirm = jev({});
        const deps = { db: database, listTransactions: async () => [transaction()], confirm };

        await sweepUnboundReceiptBindings(deps);
        await sweepUnboundReceiptBindings(deps);

        expect(confirm).toHaveBeenCalledTimes(2);
        expect((await getReceiptById(receipt.id, database))?.bindCheckOutcome).toBe('jev-unavailable');
    });

    it('asks Jev once per receipt and charge across sweeps', async () => {
        await readyReceipt();
        const confirm = jev({ 'txn-1': 0.3 });
        const deps = { db: database, listTransactions: async () => [transaction()], confirm };

        await sweepUnboundReceiptBindings(deps);
        await sweepUnboundReceiptBindings(deps);

        expect(confirm).toHaveBeenCalledTimes(1);
    });

    it('never re-binds a charge a person detached', async () => {
        const receipt = await readyReceipt();
        const deps = { db: database, listTransactions: async () => [transaction()], confirm: jev({ 'txn-1': 0.97 }) };
        await sweepUnboundReceiptBindings(deps);
        await setReceiptTransactionId(receipt.id, null, database);
        // Re-binding by hand and detaching again must not trip the rejection key.
        await setReceiptTransactionId(receipt.id, 'txn-1', database);
        await setReceiptTransactionId(receipt.id, null, database);

        await sweepUnboundReceiptBindings(deps);

        expect(await getReceiptById(receipt.id, database)).toMatchObject({
            transactionId: null,
            bindCheckOutcome: 'no-candidate',
        });
    });

    it('skips a charge another receipt is already bound to', async () => {
        const other = await readyReceipt(2);
        await setReceiptTransactionId(other.id, 'txn-1', database);
        const receipt = await readyReceipt();

        const result = await autoBindReceipt((await getReceiptById(receipt.id, database))!, {
            db: database,
            listTransactions: async () => [transaction()],
            confirm: jev({ 'txn-1': 0.97 }),
        });

        expect(result?.outcome).toBe('no-candidate');
    });

    it('does not query or bind in Practice', async () => {
        await readyReceipt();
        await setOperatingMode('practice', database);
        const listTransactions = vi.fn(async () => [transaction()]);

        await expect(sweepUnboundReceiptBindings({ db: database, listTransactions })).resolves.toBe(0);
        expect(listTransactions).not.toHaveBeenCalled();
    });

    async function readyReceipt(shade = 0) {
        const receipt = await insertReceiptOriginal(
            {
                bytes: await sharp({
                    create: { width: 1, height: 1, channels: 3, background: { r: shade * 100, g: 0, b: 0 } },
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
                printedMilliunits: 50000,
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
