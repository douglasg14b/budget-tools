import { describe, expect, it } from 'vitest';

import { formatInferenceCost } from '../ReceiptDetail';

describe('formatInferenceCost', () => {
    it('preserves sub-cent OCR costs', () => {
        expect(formatInferenceCost(0.002)).toBe('$0.002000');
    });

    it('uses a compact format for larger costs', () => {
        expect(formatInferenceCost(0.01234)).toBe('$0.0123');
        expect(formatInferenceCost(0)).toBe('$0');
    });
});
