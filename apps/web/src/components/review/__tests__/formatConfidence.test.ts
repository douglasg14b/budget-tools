import { describe, expect, it } from 'vitest';

import { formatConfidence } from '../formatConfidence';

describe('formatConfidence', () => {
    it('formats a 0–1 value as a percentage', () => {
        expect(formatConfidence(0.72)).toBe('72%');
    });

    it('rounds to the nearest whole percent', () => {
        expect(formatConfidence(0.724)).toBe('72%');
        expect(formatConfidence(0.725)).toBe('73%');
    });

    it('formats the endpoints', () => {
        expect(formatConfidence(0)).toBe('0%');
        expect(formatConfidence(1)).toBe('100%');
    });
});
