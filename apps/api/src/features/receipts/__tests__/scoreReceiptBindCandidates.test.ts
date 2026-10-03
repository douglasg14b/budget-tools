import { describe, expect, it } from 'vitest';

import type { BankTransactionMatchKeys } from '../matchReceipts';
import type { ReceiptScoreKeys } from '../scoreReceiptBindCandidates';
import { scoreReceiptBindCandidates } from '../scoreReceiptBindCandidates';

function receipt(overrides: Partial<ReceiptScoreKeys> = {}): ReceiptScoreKeys {
    return {
        id: 'rcp-1',
        vendor: 'Costco Wholesale',
        purchaseDate: '2026-02-09',
        printedMilliunits: 84170,
        totalsDisagree: false,
        ...overrides,
    };
}

function transaction(
    overrides: Partial<BankTransactionMatchKeys> & Pick<BankTransactionMatchKeys, 'id'>,
): BankTransactionMatchKeys {
    return {
        date: '2026-02-10',
        amountMilliunits: -84170,
        payeeName: 'Costco',
        importPayeeName: null,
        importPayeeNameOriginal: 'COSTCO WHSE #0123 SEATTLE WA',
        ...overrides,
    };
}

describe('scoreReceiptBindCandidates', () => {
    it('sends an exact-amount charge in the window to Jev', () => {
        const [best] = scoreReceiptBindCandidates({ receipt: receipt(), transactions: [transaction({ id: 'txn-1' })] });

        expect(best).toMatchObject({ transactionId: 'txn-1', amount: 'exact', dayOffset: 1, jevEligible: true });
    });

    it('leaves the merchant question to Jev instead of gating on names', () => {
        const [best] = scoreReceiptBindCandidates({
            receipt: receipt({ vendor: 'Some Store' }),
            transactions: [transaction({ id: 'txn-1', payeeName: 'Unrelated Name', importPayeeNameOriginal: null })],
        });

        expect(best?.jevEligible).toBe(true);
    });

    it('sends every exact-amount charge to Jev when several share the amount', () => {
        const scored = scoreReceiptBindCandidates({
            receipt: receipt(),
            transactions: [transaction({ id: 'txn-1' }), transaction({ id: 'txn-2', payeeName: 'Shell' })],
        });

        expect(scored.map((candidate) => [candidate.transactionId, candidate.jevEligible])).toEqual([
            ['txn-1', true],
            ['txn-2', true],
        ]);
    });

    it('offers a tip-band charge as a suggestion that never goes to Jev', () => {
        const [best] = scoreReceiptBindCandidates({
            receipt: receipt({ printedMilliunits: 40000 }),
            transactions: [transaction({ id: 'txn-1', amountMilliunits: -48000 })],
        });

        expect(best).toMatchObject({ amount: 'tip', tipMilliunits: 8000, jevEligible: false });
        expect(best?.blockedBy).toEqual(['not-exact-amount']);
    });

    it('drops deposits, Amazon, other amounts and charges outside the window', () => {
        expect(
            scoreReceiptBindCandidates({
                receipt: receipt(),
                transactions: [
                    transaction({ id: 'txn-deposit', amountMilliunits: 84170 }),
                    transaction({ id: 'txn-amzn', payeeName: 'Amazon', importPayeeNameOriginal: 'AMZN Mktp US' }),
                    transaction({ id: 'txn-other', amountMilliunits: -12000 }),
                    transaction({ id: 'txn-late', date: '2026-02-20' }),
                ],
            }),
        ).toEqual([]);
    });

    it('blocks charges already bound, previously rejected, or claimed by another receipt', () => {
        const score = (input: Partial<Parameters<typeof scoreReceiptBindCandidates>[0]>) =>
            scoreReceiptBindCandidates({
                receipt: receipt(),
                transactions: [transaction({ id: 'txn-1' })],
                ...input,
            })[0]?.blockedBy;

        expect(score({ boundTransactionIds: new Set(['txn-1']) })).toEqual(['already-bound']);
        expect(score({ rejectedTransactionIds: new Set(['txn-1']) })).toEqual(['rejected']);
        expect(score({ rivalReceipts: [receipt({ id: 'rcp-2', purchaseDate: '2026-02-10' })] })).toEqual([
            'rival-receipt',
        ]);
    });

    it('blocks receipts whose totals disagree or whose vendor was unreadable', () => {
        const blockedFor = (overrides: Partial<ReceiptScoreKeys>) =>
            scoreReceiptBindCandidates({ receipt: receipt(overrides), transactions: [transaction({ id: 'txn-1' })] })[0]
                ?.blockedBy;

        expect(blockedFor({ totalsDisagree: true })).toEqual(['totals-disagree']);
        expect(blockedFor({ vendor: null })).toEqual(['missing-vendor']);
    });
});
