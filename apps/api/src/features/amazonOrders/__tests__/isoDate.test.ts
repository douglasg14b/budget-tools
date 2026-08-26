import { describe, expect, it } from 'vitest';

import { addIsoDays, mergeIsoDateRanges, uncoveredIsoDateRanges } from '../isoDate';

describe('isoDate ranges', () => {
    it('merges overlapping and adjacent ranges', () => {
        expect(
            mergeIsoDateRanges([
                { start: '2026-02-01', end: '2026-02-10' },
                { start: '2026-02-11', end: '2026-02-15' },
                { start: '2026-01-20', end: '2026-01-25' },
            ]),
        ).toEqual([
            { start: '2026-01-20', end: '2026-01-25' },
            { start: '2026-02-01', end: '2026-02-15' },
        ]);
    });

    it('finds uncovered gaps inside a requested window', () => {
        expect(
            uncoveredIsoDateRanges([{ start: '2026-02-05', end: '2026-02-10' }], {
                start: '2026-02-01',
                end: '2026-02-20',
            }),
        ).toEqual([
            { start: '2026-02-01', end: '2026-02-04' },
            { start: '2026-02-11', end: '2026-02-20' },
        ]);
    });

    it('returns no gaps when the request is already covered', () => {
        expect(
            uncoveredIsoDateRanges([{ start: '2026-01-01', end: '2026-03-01' }], {
                start: '2026-02-01',
                end: '2026-02-20',
            }),
        ).toEqual([]);
    });

    it('adds calendar days in UTC', () => {
        expect(addIsoDays('2026-01-31', 1)).toBe('2026-02-01');
        expect(addIsoDays('2026-02-01', -1)).toBe('2026-01-31');
    });
});
