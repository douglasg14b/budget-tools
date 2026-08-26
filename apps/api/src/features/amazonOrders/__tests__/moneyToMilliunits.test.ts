import { describe, expect, it } from 'vitest';

import { moneyToMilliunits } from '../moneyToMilliunits';

describe('moneyToMilliunits', () => {
    it('converts major units and money objects', () => {
        expect(moneyToMilliunits(47.64)).toBe(47640);
        expect(moneyToMilliunits({ amount: -12.5, currency: 'USD' })).toBe(-12500);
        expect(moneyToMilliunits({ amount: '3.00' })).toBe(3000);
        expect(moneyToMilliunits('$9.99')).toBe(9990);
    });

    it('returns null for missing money', () => {
        expect(moneyToMilliunits(null)).toBeNull();
        expect(moneyToMilliunits({})).toBeNull();
        expect(moneyToMilliunits('nope')).toBeNull();
    });
});
