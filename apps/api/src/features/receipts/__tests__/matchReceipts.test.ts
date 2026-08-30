import { describe, expect, it } from 'vitest';

import type { BankTransactionMatchKeys, ReceiptMatchKeys } from '../matchReceipts';
import { FUZZY_PAYEE_SIMILARITY_MIN, matchReceiptsToTransaction, matchTransactionsToReceipt } from '../matchReceipts';

const STARBUCKS = 'Starbucks';

function receipt(overrides: Partial<ReceiptMatchKeys> & Pick<ReceiptMatchKeys, 'id'>): ReceiptMatchKeys {
    return {
        vendor: STARBUCKS,
        purchaseDate: '2026-02-09',
        printedMilliunits: -50000,
        totalsDisagree: false,
        ...overrides,
    };
}

function transaction(
    overrides: Partial<BankTransactionMatchKeys> & Pick<BankTransactionMatchKeys, 'id'>,
): BankTransactionMatchKeys {
    return {
        date: '2026-02-10',
        amountMilliunits: -50000,
        payeeName: STARBUCKS,
        importPayeeName: STARBUCKS,
        importPayeeNameOriginal: STARBUCKS,
        ...overrides,
    };
}

describe('matchReceiptsToTransaction', () => {
    it('auto-binds a unique amount in window with vendor/payee haystack', () => {
        const txn = transaction({ id: 'txn-1' });
        const hit = receipt({ id: 'rcp-1' });
        const result = matchReceiptsToTransaction({
            transaction: txn,
            receipts: [hit, receipt({ id: 'rcp-other', printedMilliunits: -12000, vendor: 'Other' })],
        });
        expect(result).toMatchObject({
            amazonSkipped: false,
            autoBind: true,
            exactReceiptId: 'rcp-1',
            exactTransactionId: 'txn-1',
        });
    });

    it('does not auto-bind when two receipts share the amount in the window', () => {
        const result = matchReceiptsToTransaction({
            transaction: transaction({ id: 'txn-1' }),
            receipts: [receipt({ id: 'rcp-a' }), receipt({ id: 'rcp-b', purchaseDate: '2026-02-10' })],
        });
        expect(result.autoBind).toBe(false);
        expect(result.exactReceiptId).toBeNull();
    });

    it('skips Amazon transactions so they never appear as candidates', () => {
        const result = matchReceiptsToTransaction({
            transaction: transaction({
                id: 'txn-amz',
                payeeName: 'AMZN Mktp US',
                importPayeeName: 'Amazon',
                importPayeeNameOriginal: 'AMAZON.COM',
            }),
            receipts: [receipt({ id: 'rcp-1' })],
        });
        expect(result.amazonSkipped).toBe(true);
        expect(result.autoBind).toBe(false);
        expect(result.closeMatches).toEqual([]);
    });

    it('does not auto-bind unique amount plus totals_disagree; fuzzy/search still allowed', () => {
        const result = matchReceiptsToTransaction({
            transaction: transaction({ id: 'txn-1' }),
            receipts: [
                receipt({ id: 'rcp-disagree', totalsDisagree: true }),
                receipt({
                    id: 'rcp-tip',
                    printedMilliunits: -40000,
                    vendor: STARBUCKS,
                }),
            ],
        });
        expect(result.autoBind).toBe(false);
        expect(result.exactReceiptId).toBeNull();
        expect(result.closeMatches.map((match) => match.receiptId).sort()).toEqual(['rcp-disagree', 'rcp-tip']);
        expect(result.closeMatches.find((match) => match.receiptId === 'rcp-disagree')?.reason).toBe('blocked-exact');
        expect(result.closeMatches.find((match) => match.receiptId === 'rcp-tip')?.reason).toBe('fuzzy-tip');
    });

    it(`ranks fuzzy close matches using FUZZY_PAYEE_SIMILARITY_MIN ${FUZZY_PAYEE_SIMILARITY_MIN} and a 30 percent tip cap`, () => {
        const printed = 10000;
        const cases: { bank: number; included: boolean; label: string }[] = [
            { bank: 13000, included: true, label: 'exactly 30 percent' },
            { bank: 13001, included: false, label: 'just over 30 percent' },
            { bank: 11000, included: true, label: '10 percent tip' },
            { bank: 10000, included: false, label: 'equal amounts are not fuzzy' },
            { bank: 9000, included: false, label: 'bank smaller than printed' },
        ];
        for (const testCase of cases) {
            const result = matchReceiptsToTransaction({
                transaction: transaction({ id: 'txn-1', amountMilliunits: -testCase.bank, payeeName: STARBUCKS }),
                receipts: [receipt({ id: 'rcp-1', printedMilliunits: -printed, vendor: STARBUCKS })],
            });
            const hit = result.closeMatches.some(
                (match) => match.receiptId === 'rcp-1' && match.reason === 'fuzzy-tip',
            );
            expect({ label: testCase.label, hit }).toEqual({ label: testCase.label, hit: testCase.included });
        }
    });

    it('excludes printed zero from fuzzy candidates', () => {
        const result = matchReceiptsToTransaction({
            transaction: transaction({ id: 'txn-1', amountMilliunits: -5000 }),
            receipts: [receipt({ id: 'rcp-zero', printedMilliunits: 0 })],
        });
        expect(result.autoBind).toBe(false);
        expect(result.closeMatches).toEqual([]);
    });

    it('does not exact-match a receipt outside the date window', () => {
        const result = matchReceiptsToTransaction({
            transaction: transaction({ id: 'txn-1' }),
            receipts: [receipt({ id: 'rcp-old', purchaseDate: '2026-02-01' })],
        });
        expect(result.autoBind).toBe(false);
        expect(result.closeMatches).toEqual([]);
    });
});

describe('matchTransactionsToReceipt', () => {
    it('auto-binds the unique bank row and drops Amazon candidates before uniqueness', () => {
        const rcp = receipt({ id: 'rcp-1' });
        const result = matchTransactionsToReceipt({
            receipt: rcp,
            transactions: [
                transaction({
                    id: 'txn-amz',
                    amountMilliunits: -50000,
                    payeeName: 'Amazon',
                    importPayeeName: 'AMZN',
                    importPayeeNameOriginal: null,
                }),
                transaction({ id: 'txn-hit' }),
            ],
        });
        expect(result.autoBind).toBe(true);
        expect(result.amazonSkipped).toBe(false);
        expect(result.exactTransactionId).toBe('txn-hit');
        expect(result.closeMatches.some((match) => match.transactionId === 'txn-amz')).toBe(false);
    });

    it('sets amazonSkipped when every bank row is Amazon', () => {
        const result = matchTransactionsToReceipt({
            receipt: receipt({ id: 'rcp-1' }),
            transactions: [
                transaction({
                    id: 'txn-amz',
                    payeeName: 'Amazon',
                    importPayeeName: 'AMZN',
                    importPayeeNameOriginal: null,
                }),
            ],
        });
        expect(result.amazonSkipped).toBe(true);
        expect(result.autoBind).toBe(false);
        expect(result.closeMatches).toEqual([]);
    });

    it('does not auto-bind colliding bank amounts in the window', () => {
        const result = matchTransactionsToReceipt({
            receipt: receipt({ id: 'rcp-1' }),
            transactions: [transaction({ id: 'txn-a' }), transaction({ id: 'txn-b', date: '2026-02-09' })],
        });
        expect(result.autoBind).toBe(false);
        expect(result.exactTransactionId).toBeNull();
    });
});
