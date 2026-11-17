import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppDatabaseClient } from '../../../data-persistence/database';
import { createTestAppDatabase } from '../../../data-persistence/testDatabase';
import { utcTodayIso } from '../../amazonOrders/isoDate';
import type { TransactionDetailDto } from '../../categorization/categorizationDtos';
import { listTransactionsByIds } from '../../categorization/listTransactionsByIds';
import { setOperatingMode } from '../../operatingMode/data/operatingModeRepo';
import {
    insertReceiptOriginal,
    requireReceipt,
    setReceiptExtract,
    setReceiptTransactionId,
} from '../data/receiptsRepo';
import { listTransactionsForReceiptMatch } from '../listTransactionsForReceiptMatch';
import { lookupByReceipt, matchPreview } from '../lookupReceiptMatch';
import { parseReceiptSearchExtraDays } from '../receiptSearchRange';

vi.mock('../listTransactionsForReceiptMatch', () => ({ listTransactionsForReceiptMatch: vi.fn() }));
vi.mock('../../categorization/listTransactionsByIds', () => ({ listTransactionsByIds: vi.fn() }));

const listWindow = vi.mocked(listTransactionsForReceiptMatch);
const byIds = vi.mocked(listTransactionsByIds);

beforeEach(() => {
    listWindow.mockReset();
    byIds.mockReset();
    listWindow.mockResolvedValue([]);
    byIds.mockResolvedValue([]);
});

describe('parseReceiptSearchExtraDays', () => {
    it('defaults to the plain window and accepts only the offered ranges', () => {
        expect(parseReceiptSearchExtraDays(undefined)).toBe(0);
        expect(parseReceiptSearchExtraDays(90)).toBe(90);
        expect(() => parseReceiptSearchExtraDays(7)).toThrowError(/extraDays/);
        expect(() => parseReceiptSearchExtraDays(-30)).toThrowError(/extraDays/);
        expect(() => parseReceiptSearchExtraDays(3650)).toThrowError(/extraDays/);
    });
});

describe('matchPreview search range', () => {
    const dated = {
        id: 'rcp-1',
        vendor: 'Cafe',
        purchaseDate: '2026-02-09',
        printedMilliunits: -5000,
        totalsDisagree: false,
    };
    const dateless = { ...dated, purchaseDate: null };

    it('passes the widened range to the window listing and still matches only inside the strict window', async () => {
        const inWindow = transaction({ id: 'txn-near', date: '2026-02-10', amount: -5000 });
        // Same amount and payee, but months away: listed for search, never an automatic match.
        const farOff = transaction({ id: 'txn-far', date: '2025-12-01', amount: -5000 });
        const list = vi.fn().mockResolvedValue([inWindow, farOff]);

        const result = await matchPreview({ receipts: [dated], extraDays: 90 }, list);

        expect(list).toHaveBeenCalledWith('2026-02-09', 90);
        expect(result.bindCandidates.map((row) => row.id)).toEqual(['txn-near', 'txn-far']);
        expect(result.exactTransactionId).toBe('txn-near');
    });

    it('lists nothing for a dateless receipt until widened, then anchors on today', async () => {
        const list = vi.fn().mockResolvedValue([transaction()]);

        const plain = await matchPreview({ receipts: [dateless] }, list);
        expect(list).not.toHaveBeenCalled();
        expect(plain.bindCandidates).toEqual([]);

        const widened = await matchPreview({ receipts: [dateless], extraDays: 30 }, list);
        expect(list).toHaveBeenCalledWith(utcTodayIso(), 30);
        expect(widened.bindCandidates).toHaveLength(1);
        // Nothing can auto-match without a date.
        expect(widened.autoBind).toBe(false);
        expect(widened.exactTransactionId).toBeNull();
    });

    it('rejects a range that is not on the list', async () => {
        await expect(matchPreview({ receipts: [dated], extraDays: 7 })).rejects.toMatchObject({ statusCode: 400 });
    });
});

describe('lookupByReceipt search range', () => {
    let directory: string;
    let appDb: Awaited<ReturnType<typeof createTestAppDatabase>>;
    let database: AppDatabaseClient;

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), 'api-receipts-search-range-'));
        appDb = await createTestAppDatabase();
        database = appDb.db;
        await setOperatingMode('live', database);
    });

    afterEach(async () => {
        await appDb.close();
        await rm(directory, { recursive: true, force: true });
    });

    async function storedReceipt(purchaseDate: string | null): Promise<string> {
        const created = await insertReceiptOriginal(
            { bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), receiptsDir: join(directory, 'files') },
            database,
        );
        await setReceiptExtract(
            created.id,
            {
                extractStatus: 'ungated',
                extractJson: null,
                rawText: null,
                vendor: 'Cafe',
                purchaseDate,
                printedMilliunits: -5000,
                totalsDisagree: false,
            },
            database,
        );
        return created.id;
    }

    it('asks for the default window unless widened', async () => {
        const id = await storedReceipt('2026-02-09');
        await lookupByReceipt(id, database);
        expect(listWindow).toHaveBeenLastCalledWith('2026-02-09', undefined, 0);
        await lookupByReceipt(id, database, 365);
        expect(listWindow).toHaveBeenLastCalledWith('2026-02-09', undefined, 365);
    });

    it('lists nothing for a dateless receipt, then searches around its capture day once widened', async () => {
        const id = await storedReceipt(null);
        const captured = (await requireReceipt(id, database)).createdAt.slice(0, 10);
        listWindow.mockResolvedValue([transaction()]);

        const plain = await lookupByReceipt(id, database);
        expect(listWindow).not.toHaveBeenCalled();
        expect(plain.bindCandidates).toEqual([]);

        const widened = await lookupByReceipt(id, database, 90);
        expect(listWindow).toHaveBeenCalledWith(captured, undefined, 90);
        expect(widened.bindCandidates.map((row) => row.id)).toEqual(['txn-1']);
        expect(widened.autoBind).toBe(false);
        expect(widened.exactTransactionId).toBeNull();
    });

    it('keeps a bound charge listed even when it falls outside the window', async () => {
        const id = await storedReceipt('2026-02-09');
        await setReceiptTransactionId(id, 'txn-old', database);
        listWindow.mockResolvedValue([transaction({ id: 'txn-near' })]);
        byIds.mockResolvedValue([transaction({ id: 'txn-old', date: '2025-06-01' })]);

        const result = await lookupByReceipt(id, database);

        expect(byIds).toHaveBeenCalledWith(['txn-old']);
        expect(result.bindCandidates.map((row) => row.id)).toEqual(['txn-near', 'txn-old']);
    });

    it('does not look the bound charge up again when the window already has it', async () => {
        const id = await storedReceipt('2026-02-09');
        await setReceiptTransactionId(id, 'txn-1', database);
        listWindow.mockResolvedValue([transaction({ id: 'txn-1' })]);

        const result = await lookupByReceipt(id, database);

        expect(byIds).not.toHaveBeenCalled();
        expect(result.bindCandidates.map((row) => row.id)).toEqual(['txn-1']);
    });
});

function transaction(overrides: Partial<TransactionDetailDto> = {}): TransactionDetailDto {
    return {
        id: 'txn-1',
        date: '2026-02-10',
        amount: -50000,
        memo: null,
        cleared: 'cleared',
        approved: true,
        flagColor: null,
        flagName: null,
        accountId: 'acct',
        accountName: 'Checking',
        payeeId: 'payee',
        payeeName: 'Cafe',
        categoryId: null,
        categoryName: null,
        importId: null,
        importPayeeName: 'CAFE',
        importPayeeNameOriginal: null,
        ...overrides,
    };
}
