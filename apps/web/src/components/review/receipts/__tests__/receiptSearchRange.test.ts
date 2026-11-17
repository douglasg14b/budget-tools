import { describe, expect, it } from 'vitest';

import {
    emptySearchCopy,
    limitSearchHits,
    RECEIPT_SEARCH_RANGES,
    RECEIPT_SEARCH_VISIBLE_ROWS,
} from '../receiptSearchRange';

describe('RECEIPT_SEARCH_RANGES', () => {
    it('starts at the default window and widens strictly', () => {
        const days = RECEIPT_SEARCH_RANGES.map((range) => range.extraDays);
        expect(days[0]).toBe(0);
        expect([...days].sort((a, b) => a - b)).toEqual(days);
        expect(new Set(days).size).toBe(days.length);
    });
});

describe('limitSearchHits', () => {
    const many = Array.from({ length: RECEIPT_SEARCH_VISIBLE_ROWS + 20 }, (_, index) => index);

    it('caps an unsearched long list and reports what it held back', () => {
        const { rows, hidden } = limitSearchHits(many, undefined);
        expect(rows).toHaveLength(RECEIPT_SEARCH_VISIBLE_ROWS);
        expect(hidden).toBe(20);
    });

    it('shows every hit once the user is searching, and every row of a short list', () => {
        expect(limitSearchHits(many, 'cafe')).toEqual({ rows: many, hidden: 0 });
        expect(limitSearchHits([1, 2, 3], undefined)).toEqual({ rows: [1, 2, 3], hidden: 0 });
    });
});

describe('emptySearchCopy', () => {
    it('blames the search, not the window, when charges exist', () => {
        expect(emptySearchCopy({ candidateCount: 4, extraDays: 0, hasPurchaseDate: true })).toBe(
            'No charges match that search.',
        );
    });

    it('points at the range when nothing is in the default window', () => {
        expect(emptySearchCopy({ candidateCount: 0, extraDays: 0, hasPurchaseDate: true })).toMatch(/Widen the range/);
    });

    it('explains a dateless receipt rather than claiming the window is empty', () => {
        expect(emptySearchCopy({ candidateCount: 0, extraDays: 0, hasPurchaseDate: false })).toMatch(/no date/);
    });

    it('names the range that came back empty', () => {
        expect(emptySearchCopy({ candidateCount: 0, extraDays: 90, hasPurchaseDate: true })).toMatch(/3 months/);
    });
});
