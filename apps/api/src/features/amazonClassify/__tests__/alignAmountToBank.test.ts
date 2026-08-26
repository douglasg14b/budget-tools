import { describe, expect, it } from 'vitest';

import { alignAmountToBank } from '../alignAmountToBank';

describe('alignAmountToBank', () => {
    it('turns a positive Amazon item into an outflow on a charge', () => {
        expect(alignAmountToBank(19990, -73920)).toBe(-19990);
    });

    it('keeps a refund item positive', () => {
        expect(alignAmountToBank(19990, 73920)).toBe(19990);
    });
});
