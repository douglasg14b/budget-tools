import type { PeriodicMatchDto } from '@budget-tools/web-sdk';
import { describe, expect, it } from 'vitest';

import { formatPeriodicBadgeLabel, formatPeriodicHint, formatPeriodicSeriesCaption } from '../formatPeriodicHint';

describe('formatPeriodicHint', () => {
    it('summarizes a matching series', () => {
        expect(formatPeriodicHint(match(), { conflict: false })).toBe('Monthly · 6 times · Streaming');
    });

    it('labels the badge with cadence and occurrence count', () => {
        expect(formatPeriodicBadgeLabel(match())).toBe('Monthly ×6');
    });

    it('calls out a category conflict', () => {
        expect(formatPeriodicHint(match(), { conflict: true })).toBe(
            "Monthly history is Streaming (6 times) — doesn't match this suggestion",
        );
    });

    it('omits category when the series has no usable labels', () => {
        expect(formatPeriodicHint(match({ category: null }), { conflict: false })).toBe('Monthly · 6 times');
    });

    it('notes when the modal list is a subset of the series', () => {
        expect(formatPeriodicSeriesCaption(match(), 6)).toBeUndefined();
        expect(formatPeriodicSeriesCaption(match(), 4)).toBe('Showing 4 of 6 prior charges');
    });
});

function match(overrides: Partial<PeriodicMatchDto> = {}): PeriodicMatchDto {
    return {
        cadence: 'Monthly',
        occurrenceCount: 6,
        medianAmount: -9990,
        lastDate: '2026-07-20',
        category: 'Streaming',
        categoryVoteShare: 1,
        relatedTransactionIds: ['a'],
        cadenceFit: 1,
        ...overrides,
    };
}
