import { describe, expect, it } from 'vitest';

import { smoothDailySeries } from '../smoothDailySeries';

function closeTo(actual: readonly number[], expected: readonly number[]): void {
    expect(actual).toHaveLength(expected.length);
    actual.forEach((value, index) => {
        expect(value).toBeCloseTo(expected[index] ?? Number.NaN, 6);
    });
}

describe('smoothDailySeries', () => {
    it('returns the series unchanged for a 1-day window', () => {
        expect(smoothDailySeries([5, 0, 7], 1)).toEqual([5, 0, 7]);
    });

    it('spreads one purchase evenly over the window starting on the purchase day', () => {
        closeTo(smoothDailySeries([0, 70, 0, 0, 0, 0, 0, 0, 0, 0], 7), [0, 10, 10, 10, 10, 10, 10, 10, 0, 0]);
    });

    it('adds overlapping purchases together', () => {
        // $100 on day 0, $50 on day 7, $100 on day 21, $20 on day 22, 7-day window.
        const daily = new Array<number>(30).fill(0);
        daily[0] = 100;
        daily[7] = 50;
        daily[21] = 100;
        daily[22] = 20;

        const smoothed = smoothDailySeries(daily, 7);

        closeTo(smoothed.slice(0, 7), new Array(7).fill(100 / 7));
        closeTo(smoothed.slice(7, 14), new Array(7).fill(50 / 7));
        closeTo(smoothed.slice(14, 21), new Array(7).fill(0));
        expect(smoothed[21]).toBeCloseTo(100 / 7, 6);
        closeTo(smoothed.slice(22, 28), new Array(6).fill(120 / 7));
        expect(smoothed[28]).toBeCloseTo(20 / 7, 6);
        expect(smoothed[29]).toBeCloseTo(0, 6);
    });

    it('keeps the total once every purchase has fully spread', () => {
        const daily = [30, 0, 12, -6, 0, 0, 0, 0, 0, 0];
        const smoothed = smoothDailySeries(daily, 4);
        const total = smoothed.reduce((sum, value) => sum + value, 0);
        expect(total).toBeCloseTo(36, 6);
    });

    it('rejects a non-positive or fractional window', () => {
        expect(() => smoothDailySeries([1], 0)).toThrow(RangeError);
        expect(() => smoothDailySeries([1], 2.5)).toThrow(RangeError);
    });
});
