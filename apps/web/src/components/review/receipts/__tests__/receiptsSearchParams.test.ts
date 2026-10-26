import { describe, expect, it } from 'vitest';

import type { ReceiptsSearchState } from '../receiptsSearchParams';
import {
    parseReceiptsSearchParams,
    receiptMatchesSearch,
    receiptsFilterCount,
    serializeReceiptsSearchParams,
} from '../receiptsSearchParams';

const none: ReceiptsSearchState = { q: undefined, reimbursable: false, bound: undefined, issue: undefined };

describe('parseReceiptsSearchParams', () => {
    it('defaults to no filters', () => {
        expect(parseReceiptsSearchParams(new URLSearchParams())).toEqual(none);
    });

    it('reads q, reimbursable, bound, and issue, ignoring unknown bound and issue values', () => {
        expect(
            parseReceiptsSearchParams(
                new URLSearchParams('q=costco&reimbursable=1&bound=unbound&issue=bind-ambiguous'),
            ),
        ).toEqual({
            q: 'costco',
            reimbursable: true,
            bound: 'unbound',
            issue: 'bind-ambiguous',
        });
        expect(parseReceiptsSearchParams(new URLSearchParams('bound=maybe&q=%20')).bound).toBeUndefined();
        expect(parseReceiptsSearchParams(new URLSearchParams('issue=lost-race')).issue).toBeUndefined();
        expect(parseReceiptsSearchParams(new URLSearchParams('q=%20')).q).toBeUndefined();
    });

    it('round-trips through serialize and counts active filters', () => {
        const state: ReceiptsSearchState = { q: 'tip', reimbursable: true, bound: 'bound', issue: 'any' };
        expect(parseReceiptsSearchParams(serializeReceiptsSearchParams(state))).toEqual(state);
        expect(receiptsFilterCount(state)).toBe(4);
        expect(serializeReceiptsSearchParams(none).toString()).toBe('');
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
        extractStatus: 'gated' as const,
        totalsDisagree: false,
    };

    it('applies chips and every search term', () => {
        expect(receiptMatchesSearch(receipt, { ...none, reimbursable: true, bound: 'unbound' })).toBe(true);
        expect(receiptMatchesSearch(receipt, { ...none, bound: 'bound' })).toBe(false);
        expect(receiptMatchesSearch({ ...receipt, extractJson: null }, { ...none, reimbursable: true })).toBe(false);
        expect(receiptMatchesSearch(receipt, { ...none, q: 'costco towels' })).toBe(true);
        expect(receiptMatchesSearch(receipt, { ...none, q: '54.61' })).toBe(true);
        expect(receiptMatchesSearch(receipt, { ...none, q: 'walmart' })).toBe(false);
    });

    it('keeps only receipts with the chosen issue', () => {
        expect(receiptMatchesSearch(receipt, { ...none, issue: 'any' })).toBe(false);
        expect(receiptMatchesSearch({ ...receipt, totalsDisagree: true }, { ...none, issue: 'any' })).toBe(true);
        expect(receiptMatchesSearch({ ...receipt, extractStatus: 'failed' }, { ...none, issue: 'unreadable' })).toBe(
            true,
        );
        // Practice receipts carry no auto-bind check.
        expect(receiptMatchesSearch(receipt, { ...none, issue: 'bind-ambiguous' })).toBe(false);
    });
});
