import { describe, expect, it } from 'vitest';

import { arithmeticGate, printedTotalsDisagree } from '../arithmeticGate';

describe('arithmeticGate', () => {
    it('gates when lines plus tax minus discounts equal printed milliunits', () => {
        expect(
            arithmeticGate({
                lines: [
                    { name: 'Coffee', amountMilliunits: 4500, quantity: 1 },
                    { name: 'Muffin', amountMilliunits: 3200, quantity: 1 },
                ],
                taxMilliunits: 620,
                discountMilliunits: 200,
                tipMilliunits: 0,
                printedMilliunits: 8120,
            }),
        ).toEqual({ gated: true, computedTotalMilliunits: 8120 });
    });

    it('adds the tip toward the grand total', () => {
        expect(
            arithmeticGate({
                lines: [{ name: 'Subtotal', amountMilliunits: 12_660, quantity: null }],
                taxMilliunits: 0,
                discountMilliunits: 0,
                tipMilliunits: 5000,
                printedMilliunits: 17_660,
            }),
        ).toEqual({ gated: true, computedTotalMilliunits: 17_660 });
    });

    it('does not gate when the sum disagrees with printed', () => {
        expect(
            arithmeticGate({
                lines: [{ name: 'Coffee', amountMilliunits: 4500, quantity: 1 }],
                taxMilliunits: 0,
                discountMilliunits: 0,
                tipMilliunits: 0,
                printedMilliunits: 5000,
            }),
        ).toEqual({ gated: false, computedTotalMilliunits: 4500 });
    });

    it('does not gate when any line amount is missing', () => {
        expect(
            arithmeticGate({
                lines: [
                    { name: 'Coffee', amountMilliunits: 4500, quantity: 1 },
                    { name: 'Unknown', amountMilliunits: null, quantity: null },
                ],
                taxMilliunits: 0,
                discountMilliunits: 0,
                tipMilliunits: 0,
                printedMilliunits: 4500,
            }),
        ).toEqual({ gated: false, computedTotalMilliunits: null });
    });

    it('treats an empty line list as gated only when tax minus discount equals printed', () => {
        expect(
            arithmeticGate({
                lines: [],
                taxMilliunits: 1000,
                discountMilliunits: 0,
                tipMilliunits: 0,
                printedMilliunits: 1000,
            }),
        ).toEqual({ gated: true, computedTotalMilliunits: 1000 });
        expect(
            arithmeticGate({
                lines: [],
                taxMilliunits: 0,
                discountMilliunits: 0,
                tipMilliunits: 0,
                printedMilliunits: 1000,
            }).gated,
        ).toBe(false);
    });
});

describe('printedTotalsDisagree', () => {
    it('is true only when both totals exist and differ', () => {
        expect(printedTotalsDisagree(1000, 1100)).toBe(true);
        expect(printedTotalsDisagree(1000, 1000)).toBe(false);
        expect(printedTotalsDisagree(1000, null)).toBe(false);
        expect(printedTotalsDisagree(null, 1000)).toBe(false);
        expect(printedTotalsDisagree(null, null)).toBe(false);
    });
});
