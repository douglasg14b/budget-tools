import { describe, expect, it } from 'vitest';

import type { TransactionQueryFields } from '../transactionMatchesQuery';
import { transactionMatchesQuery } from '../transactionMatchesQuery';

const starbucks: TransactionQueryFields = {
    date: '2026-03-12',
    amount: -12340,
    memo: 'Latte run',
    accountName: 'Checking',
    payeeName: 'Starbucks',
    categoryName: 'Coffee',
    importPayeeName: 'SQ *STARBUCKS',
    importPayeeNameOriginal: 'SQ *STARBUCKS STORE 123',
};

describe('transactionMatchesQuery', () => {
    it('matches everything when the query is blank', () => {
        expect(transactionMatchesQuery(starbucks, undefined)).toBe(true);
        expect(transactionMatchesQuery(starbucks, '')).toBe(true);
        expect(transactionMatchesQuery(starbucks, '   ')).toBe(true);
    });

    it('matches payee case-insensitively', () => {
        expect(transactionMatchesQuery(starbucks, 'STAR')).toBe(true);
        expect(transactionMatchesQuery(starbucks, 'dunkin')).toBe(false);
    });

    it('requires every whitespace-separated term', () => {
        expect(transactionMatchesQuery(starbucks, 'starbucks latte')).toBe(true);
        expect(transactionMatchesQuery(starbucks, 'starbucks muffin')).toBe(false);
    });

    it('matches import names, memo, category, account, and date', () => {
        expect(transactionMatchesQuery(starbucks, 'store 123')).toBe(true);
        expect(transactionMatchesQuery(starbucks, 'latte')).toBe(true);
        expect(transactionMatchesQuery(starbucks, 'coffee')).toBe(true);
        expect(transactionMatchesQuery(starbucks, 'checking')).toBe(true);
        expect(transactionMatchesQuery(starbucks, '2026-03-12')).toBe(true);
    });

    it('matches formatted dollar amounts', () => {
        expect(transactionMatchesQuery(starbucks, '12.34')).toBe(true);
        expect(transactionMatchesQuery(starbucks, '$12.34')).toBe(true);
        expect(transactionMatchesQuery(starbucks, '99.00')).toBe(false);
    });
});
