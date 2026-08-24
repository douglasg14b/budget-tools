import { describe, expect, it } from 'vitest';

import { formatTransactionDate } from '../formatTransactionDate';

describe('formatTransactionDate', () => {
    it('formats a calendar date without UTC shifting', () => {
        expect(formatTransactionDate('2026-01-15')).toBe('Jan 15, 2026');
    });
});
