import type { ReceiptBindCandidateDto } from '@budget-tools/web-sdk';
import { describe, expect, it } from 'vitest';

import { filterBindCandidates } from '../filterBindCandidates';

describe('filterBindCandidates', () => {
    const store = candidate({ id: 'txn-store', payeeName: 'Save Mart', amount: -3990 });
    const amazon = candidate({
        id: 'txn-amz',
        payeeName: 'AMZN Mktp',
        importPayeeName: 'Amazon',
        amount: -12000,
    });
    const coffee = candidate({ id: 'txn-coffee', payeeName: 'Starbucks', amount: -5500, date: '2026-02-10' });

    it('drops Amazon payees even when the query would match', () => {
        expect(filterBindCandidates([store, amazon, coffee], 'amazon').map((row) => row.id)).toEqual([]);
        expect(filterBindCandidates([store, amazon, coffee], undefined).map((row) => row.id)).toEqual([
            'txn-store',
            'txn-coffee',
        ]);
    });

    it('requires every search term to match payee, date, or amount', () => {
        expect(filterBindCandidates([store, coffee], 'starbucks').map((row) => row.id)).toEqual(['txn-coffee']);
        expect(filterBindCandidates([store, coffee], '5.50').map((row) => row.id)).toEqual(['txn-coffee']);
        expect(filterBindCandidates([store, coffee], 'starbucks mart').map((row) => row.id)).toEqual([]);
    });
});

function candidate(overrides: Partial<ReceiptBindCandidateDto> & { id: string }): ReceiptBindCandidateDto {
    return {
        date: '2026-02-09',
        amount: -1000,
        payeeName: null,
        importPayeeName: null,
        importPayeeNameOriginal: null,
        accountName: 'Visa',
        categoryName: null,
        memo: null,
        ...overrides,
    };
}
