import { describe, expect, it } from 'vitest';

import { formatYnabAmount } from '../formatYnabAmount';

describe('formatYnabAmount', () => {
    it('formats zero', () => {
        expect(formatYnabAmount(0)).toBe('$0.00');
    });

    it('formats an outflow from milliunits', () => {
        expect(formatYnabAmount(-12340)).toBe('-$12.34');
    });

    it('formats an inflow from milliunits', () => {
        expect(formatYnabAmount(1500)).toBe('$1.50');
    });

    it('groups thousands', () => {
        expect(formatYnabAmount(1_234_560)).toBe('$1,234.56');
    });
});
