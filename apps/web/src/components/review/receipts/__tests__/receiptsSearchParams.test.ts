import { describe, expect, it } from 'vitest';

import {
    parseReceiptsSearchParams,
    receiptMatchesSearch,
    receiptsFilterCount,
    serializeReceiptsSearchParams,
} from '../receiptsSearchParams';

describe('parseReceiptsSearchParams', () => {
    it('defaults to no filters', () => {
        expect(parseReceiptsSearchParams(new URLSearchParams())).toEqual({
            q: undefined,
            reimbursable: false,
            bound: undefined,
        });
    });

    it('reads q, reimbursable, and bound, ignoring unknown bound values', () => {
        expect(parseReceiptsSearchParams(new URLSearchParams('q=costco&reimbursable=1&bound=unbound'))).toEqual({
            q: 'costco',
            reimbursable: true,
            bound: 'unbound',
        });
        expect(parseReceiptsSearchParams(new URLSearchParams('bound=maybe&q=%20')).bound).toBeUndefined();
        expect(parseReceiptsSearchParams(new URLSearchParams('q=%20')).q).toBeUndefined();
    });

    it('round-trips through serialize and counts active filters', () => {
        const state = { q: 'tip', reimbursable: true, bound: 'bound' as const };
        expect(parseReceiptsSearchParams(serializeReceiptsSearchParams(state))).toEqual(state);
        expect(receiptsFilterCount(state)).toBe(3);
        expect(serializeReceiptsSearchParams({ q: undefined, reimbursable: false, bound: undefined }).toString()).toBe(
            '',
        );
    });
});

describe('receiptMatchesSearch', () => {
    const receipt = {
        vendor: 'Costco',
        purchaseDate: '2026-09-14',
        printedMilliunits: 54610,
        rawText: 'Paper Towels 21.99',
        extractJson: JSON.stringify({ lines: [], reimbursable: { writtenText: null, amountMilliunits: null } }),
        transactionId: null,
    };

    it('applies chips and every search term', () => {
        expect(receiptMatchesSearch(receipt, { q: undefined, reimbursable: true, bound: 'unbound' })).toBe(true);
        expect(receiptMatchesSearch(receipt, { q: undefined, reimbursable: false, bound: 'bound' })).toBe(false);
        expect(
            receiptMatchesSearch(
                { ...receipt, extractJson: null },
                { q: undefined, reimbursable: true, bound: undefined },
            ),
        ).toBe(false);
        expect(receiptMatchesSearch(receipt, { q: 'costco towels', reimbursable: false, bound: undefined })).toBe(true);
        expect(receiptMatchesSearch(receipt, { q: '54.61', reimbursable: false, bound: undefined })).toBe(true);
        expect(receiptMatchesSearch(receipt, { q: 'walmart', reimbursable: false, bound: undefined })).toBe(false);
    });
});
