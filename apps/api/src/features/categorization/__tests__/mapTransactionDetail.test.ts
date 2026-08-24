import { describe, expect, it } from 'vitest';

import { mapTransactionDetail, parseTransactionClearedStatus } from '../mapTransactionDetail';

describe('parseTransactionClearedStatus', () => {
    it('accepts YNAB cleared statuses', () => {
        expect(parseTransactionClearedStatus('uncleared')).toBe('uncleared');
        expect(parseTransactionClearedStatus('cleared')).toBe('cleared');
        expect(parseTransactionClearedStatus('reconciled')).toBe('reconciled');
    });

    it('rejects unknown values', () => {
        expect(() => parseTransactionClearedStatus('pending')).toThrow(/cleared status/);
    });
});

describe('mapTransactionDetail', () => {
    it('maps a settled YNAB cleared value onto the API transaction', () => {
        const detail = mapTransactionDetail({
            id: 'tx-1',
            date: '2026-08-01',
            amount: -4500,
            memo: null,
            cleared: 'reconciled',
            approved: false,
            account_id: 'acct-1',
            account_name: 'Visa',
            payee_id: null,
            payee_name: 'Coffee',
            category_id: null,
            category_name: null,
            import_id: null,
            import_payee_name: null,
            import_payee_name_original: 'SQ *COFFEE',
        });

        expect(detail.cleared).toBe('reconciled');
    });
});
