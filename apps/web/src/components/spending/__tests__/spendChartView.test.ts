import { describe, expect, it } from 'vitest';

import { assignColorSlots, buildChartRows, rangeStart, resolveCharted } from '../spendChartView';

describe('spendChartView', () => {
    it('counts the end day in the range', () => {
        expect(rangeStart('2026-10-06', 1)).toBe('2026-10-06');
        expect(rangeStart('2026-10-06', 30)).toBe('2026-09-07');
        expect(rangeStart('2026-03-01', 2)).toBe('2026-02-28');
    });

    it('keeps existing color slots and fills the lowest free one', () => {
        const first = assignColorSlots(new Map(), ['a', 'b', 'c']);
        expect([...first]).toEqual([
            ['a', 0],
            ['b', 1],
            ['c', 2],
        ]);

        const afterRemove = assignColorSlots(first, ['a', 'c']);
        expect(afterRemove.get('c')).toBe(2);

        const afterAdd = assignColorSlots(afterRemove, ['a', 'c', 'd']);
        expect(afterAdd.get('d')).toBe(1);
        expect(afterAdd.get('c')).toBe(2);
    });

    it('builds dollar rows for charted categories only', () => {
        const rows = buildChartRows(
            ['2026-03-01', '2026-03-02'],
            [
                { categoryId: 'a', dailyMilliunits: [1500, 0] },
                { categoryId: 'b', dailyMilliunits: [9000, 9000] },
            ],
            ['a'],
            (day) => day.slice(5),
        );
        expect(rows).toEqual([
            { day: '2026-03-01', label: '03-01', a: 1.5 },
            { day: '2026-03-02', label: '03-02', a: 0 },
        ]);
    });

    it('charts the largest categories until a selection is saved', () => {
        expect(resolveCharted(null, ['a', 'b', 'c', 'd', 'e', 'f'])).toEqual(['a', 'b', 'c', 'd', 'e']);
        expect(resolveCharted(null, ['a'])).toEqual(['a']);
    });

    it('keeps a saved selection, dropping categories not in the data', () => {
        expect(resolveCharted(['gone', 'b'], ['a', 'b', 'c'])).toEqual(['b']);
        expect(resolveCharted([], ['a', 'b'])).toEqual([]);
    });
});
