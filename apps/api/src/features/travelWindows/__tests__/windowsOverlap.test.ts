import { describe, expect, it } from 'vitest';

import { findOverlappingWindow, windowsOverlap } from '../windowsOverlap';

describe('windowsOverlap', () => {
    it('rejects two unscoped windows that share dates', () => {
        expect(
            windowsOverlap(
                { startDate: '2026-07-01', endDate: '2026-07-10', accountIds: [] },
                { startDate: '2026-07-08', endDate: '2026-07-12', accountIds: [] },
            ),
        ).toBe(true);
    });

    it('rejects an unscoped window overlapping a card-scoped window', () => {
        expect(
            windowsOverlap(
                { startDate: '2026-07-01', endDate: '2026-07-10', accountIds: [] },
                { startDate: '2026-07-08', endDate: '2026-07-12', accountIds: ['card-a'] },
            ),
        ).toBe(true);
    });

    it('allows the same dates on two different cards', () => {
        expect(
            windowsOverlap(
                { startDate: '2026-07-01', endDate: '2026-07-10', accountIds: ['card-a'] },
                { startDate: '2026-07-01', endDate: '2026-07-10', accountIds: ['card-b'] },
            ),
        ).toBe(false);
    });

    it('rejects overlapping dates when account sets intersect', () => {
        expect(
            windowsOverlap(
                { startDate: '2026-07-01', endDate: '2026-07-10', accountIds: ['card-a', 'card-b'] },
                { startDate: '2026-07-10', endDate: '2026-07-12', accountIds: ['card-b', 'card-c'] },
            ),
        ).toBe(true);
    });

    it('allows overlapping dates when account sets are disjoint', () => {
        expect(
            windowsOverlap(
                { startDate: '2026-07-01', endDate: '2026-07-10', accountIds: ['card-a', 'card-b'] },
                { startDate: '2026-07-01', endDate: '2026-07-10', accountIds: ['card-c'] },
            ),
        ).toBe(false);
    });

    it('rejects the same card on overlapping dates', () => {
        expect(
            windowsOverlap(
                { startDate: '2026-07-01', endDate: '2026-07-10', accountIds: ['card-a'] },
                { startDate: '2026-07-10', endDate: '2026-07-12', accountIds: ['card-a'] },
            ),
        ).toBe(true);
    });

    it('allows adjacent (non-overlapping) dates on the same card', () => {
        expect(
            windowsOverlap(
                { startDate: '2026-07-01', endDate: '2026-07-10', accountIds: ['card-a'] },
                { startDate: '2026-07-11', endDate: '2026-07-12', accountIds: ['card-a'] },
            ),
        ).toBe(false);
    });

    it('ignores a window compared to itself by id', () => {
        expect(
            findOverlappingWindow({ id: 'w1', startDate: '2026-07-01', endDate: '2026-07-10', accountIds: [] }, [
                { id: 'w1', startDate: '2026-07-01', endDate: '2026-07-10', accountIds: [] },
            ]),
        ).toBeUndefined();
    });
});
