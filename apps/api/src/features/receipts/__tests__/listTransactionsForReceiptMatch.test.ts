import { describe, expect, it } from 'vitest';

import type { TransactionDetailDto } from '../../categorization/categorizationDtos';
import { excludeAmazonTransactions, receiptMatchTransactionCriteria } from '../listTransactionsForReceiptMatch';
import { bankDateWindowForPurchaseDate } from '../paymentDateWindow';

function transaction(overrides: Partial<TransactionDetailDto>): TransactionDetailDto {
    return {
        id: 'txn-1',
        date: '2026-02-10',
        amount: -50000,
        memo: null,
        cleared: 'cleared',
        approved: true,
        accountId: 'acct',
        accountName: 'Checking',
        payeeId: 'payee',
        payeeName: 'Starbucks',
        categoryId: 'cat',
        categoryName: 'Coffee',
        importId: null,
        importPayeeName: 'STARBUCKS',
        importPayeeNameOriginal: 'STARBUCKS STORE',
        ...overrides,
    };
}

describe('excludeAmazonTransactions', () => {
    it('drops Amazon payees so they are never listTransactionsForReceiptMatch results', () => {
        const kept = transaction({ id: 'txn-store' });
        const dropped = transaction({
            id: 'txn-amz',
            payeeName: 'AMZN Mktp',
            importPayeeName: 'Amazon',
            importPayeeNameOriginal: null,
            categoryName: 'Everything Else',
        });
        expect(excludeAmazonTransactions([kept, dropped]).map((row) => row.id)).toEqual(['txn-store']);
    });
});

describe('receiptMatchTransactionCriteria', () => {
    it('uses pending-queue deleted/cleared/non-transfer filters plus the inverted date window', () => {
        const criteria = receiptMatchTransactionCriteria('2026-02-05');
        expect(criteria).toEqual({
            deleted: false,
            transferAccountId: null,
            cleared: ['cleared', 'reconciled'],
            window: bankDateWindowForPurchaseDate('2026-02-05'),
        });
        expect(criteria.window).toEqual({ earliestDate: '2026-02-04', latestDate: '2026-02-10' });
    });
});
