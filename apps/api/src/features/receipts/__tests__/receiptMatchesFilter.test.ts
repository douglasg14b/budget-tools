import { describe, expect, it } from 'vitest';

import type { ReceiptFilterFields } from '../receiptMatchesFilter';
import { receiptFilterActive, receiptMatchesFilter } from '../receiptMatchesFilter';

const base: ReceiptFilterFields = {
    vendor: 'Costco Wholesale',
    purchaseDate: '2026-09-14',
    printedMilliunits: 54610,
    rawText: 'Kirkland Paper Towels 21.99\nTax 1.20',
    extractJson: JSON.stringify({ lines: [] }),
    transactionId: null,
};

const reimbursable: ReceiptFilterFields = {
    ...base,
    extractJson: JSON.stringify({ lines: [], reimbursable: { writtenText: 'Reimb $20.00', amountMilliunits: 20000 } }),
};

describe('receiptMatchesFilter', () => {
    it('matches everything with no filter', () => {
        expect(receiptFilterActive({})).toBe(false);
        expect(receiptMatchesFilter(base, {})).toBe(true);
        expect(receiptMatchesFilter(base, { q: '   ' })).toBe(true);
    });

    it('keeps only receipts carrying a reimbursable note', () => {
        expect(receiptMatchesFilter(reimbursable, { reimbursable: true })).toBe(true);
        expect(receiptMatchesFilter(base, { reimbursable: true })).toBe(false);
        expect(receiptMatchesFilter({ ...base, extractJson: null }, { reimbursable: true })).toBe(false);
        expect(receiptMatchesFilter({ ...base, extractJson: 'not json' }, { reimbursable: true })).toBe(false);
    });

    it('splits on bound state', () => {
        const bound = { ...base, transactionId: 'txn-1' };
        expect(receiptMatchesFilter(bound, { bound: 'bound' })).toBe(true);
        expect(receiptMatchesFilter(base, { bound: 'bound' })).toBe(false);
        expect(receiptMatchesFilter(base, { bound: 'unbound' })).toBe(true);
        expect(receiptMatchesFilter(bound, { bound: 'unbound' })).toBe(false);
    });

    it('needs every search term somewhere in vendor, date, total, lines, or the note', () => {
        expect(receiptMatchesFilter(base, { q: 'costco towels' })).toBe(true);
        expect(receiptMatchesFilter(base, { q: 'COSTCO' })).toBe(true);
        expect(receiptMatchesFilter(base, { q: '2026-09' })).toBe(true);
        expect(receiptMatchesFilter(base, { q: '$54.61' })).toBe(true);
        expect(receiptMatchesFilter(base, { q: 'costco walmart' })).toBe(false);
        expect(receiptMatchesFilter(base, { q: 'reimb' })).toBe(false);
        expect(receiptMatchesFilter(reimbursable, { q: 'reimbursable' })).toBe(true);
        expect(receiptMatchesFilter(reimbursable, { q: '20.00' })).toBe(true);
    });
});
