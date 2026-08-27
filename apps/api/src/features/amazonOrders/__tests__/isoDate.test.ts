import { describe, expect, it } from 'vitest';

import {
    addIsoDays,
    amazonPaymentIndexRange,
    coveredRangeFromScrapedPayments,
    mergeIsoDateRanges,
    paymentScrapeRange,
    uncoveredIsoDateRanges,
    utcTodayIso,
} from '../isoDate';

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

    it('covers the requested window when pagination finished', () => {
        expect(
            coveredRangeFromScrapedPayments({ start: '2026-05-01', end: '2026-08-26' }, ['2026-07-27'], true),
        ).toEqual({ start: '2026-05-01', end: '2026-08-26' });
    });

    it('covers from the oldest in-range payment through the scrape end when paging did not finish', () => {
        expect(
            coveredRangeFromScrapedPayments(
                { start: '2026-08-20', end: '2026-08-26' },
                ['2026-08-25', '2026-08-21'],
                false,
            ),
        ).toEqual({ start: '2026-08-21', end: '2026-08-26' });
    });

    it('indexes payments from the oldest uncategorized Amazon day through today', () => {
        expect(
            amazonPaymentIndexRange({
                requested: { start: '2026-06-20', end: '2026-06-26' },
                oldestUncategorizedDate: '2026-01-15',
                today: '2026-08-26',
            }),
        ).toEqual({ start: '2026-01-10', end: '2026-08-26' });
    });

    it('still extends a classify window through today when there is no older queue item', () => {
        expect(
            amazonPaymentIndexRange({
                requested: { start: '2026-02-01', end: '2026-02-10' },
                oldestUncategorizedDate: null,
                today: '2026-08-26',
            }),
        ).toEqual({ start: '2026-02-01', end: '2026-08-26' });
    });

    it('scrapes one Your Payments walk from the oldest gap through today', () => {
        expect(
            paymentScrapeRange(
                [
                    { start: '2026-01-10', end: '2026-02-28' },
                    { start: '2026-06-01', end: '2026-08-26' },
                ],
                '2026-08-26',
            ),
        ).toEqual({ start: '2026-01-10', end: '2026-08-26' });
        expect(paymentScrapeRange([], '2026-08-26')).toBeNull();
    });

    it('formats UTC today as an ISO date', () => {
        expect(utcTodayIso(new Date('2026-08-26T23:15:00.000Z'))).toBe('2026-08-26');
    });

    it('does not cover a window that returned no payments and did not finish paging', () => {
        expect(
            coveredRangeFromScrapedPayments({ start: '2026-06-21', end: '2026-06-27' }, ['2026-08-25'], false),
        ).toBeNull();
    });
});
