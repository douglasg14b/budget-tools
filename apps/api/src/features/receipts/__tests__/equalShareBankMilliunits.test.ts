import { describe, expect, it } from 'vitest';

import { equalShareBankMilliunits } from '../equalShareBankMilliunits';

describe('equalShareBankMilliunits', () => {
    it('puts the remainder on the last line so shares sum to the bank amount', () => {
        expect(equalShareBankMilliunits(-10000, 3)).toEqual([-3333, -3333, -3334]);
        expect(equalShareBankMilliunits(-10000, 3).reduce((sum, amount) => sum + amount, 0)).toBe(-10000);
        expect(equalShareBankMilliunits(5000, 2)).toEqual([2500, 2500]);
    });

    it('does not invent a split for one line', () => {
        expect(equalShareBankMilliunits(-8120, 1)).toEqual([-8120]);
        expect(equalShareBankMilliunits(-8120, 0)).toEqual([]);
    });
});
