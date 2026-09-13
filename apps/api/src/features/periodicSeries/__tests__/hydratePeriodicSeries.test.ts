import { describe, expect, it } from 'vitest';

import type { TransactionDetailDto } from '../../categorization/categorizationDtos';
import { attachSeriesRelatedTransactions, collectSeriesRelatedIds } from '../hydratePeriodicSeries';
import type { PeriodicSeriesWithoutRelated } from '../parsePeriodicSeries';

describe('collectSeriesRelatedIds', () => {
    it('returns unique ids in first-seen order', () => {
        expect(collectSeriesRelatedIds([series(['tx-a', 'tx-b']), series(['tx-b', 'tx-c'])])).toEqual([
            'tx-a',
            'tx-b',
            'tx-c',
        ]);
    });
});

describe('attachSeriesRelatedTransactions', () => {
    it('keeps each series related-id order and drops missing rows', () => {
        const relatedA = transaction('tx-a');
        const relatedC = transaction('tx-c');
        const attached = attachSeriesRelatedTransactions(
            [series(['tx-c', 'tx-missing', 'tx-a'])],
            new Map([
                ['tx-a', relatedA],
                ['tx-c', relatedC],
            ]),
        );

        expect(attached[0]?.relatedTransactions).toEqual([relatedC, relatedA]);
    });
});

function series(relatedTransactionIds: string[]): PeriodicSeriesWithoutRelated {
    return {
        id: 'id:payee-1|Monthly|-14990',
        payeeName: 'Netflix',
        cadence: 'Monthly',
        occurrenceCount: relatedTransactionIds.length,
        medianAmount: -14990,
        lastDate: '2024-06-15',
        expectedNextDate: '2024-07-16',
        category: 'Streaming',
        categoryVoteShare: 1,
        categoryStable: true,
        cadenceFit: 1,
        relatedTransactionIds,
    };
}

function transaction(id: string): TransactionDetailDto {
    return {
        id,
        date: '2024-06-15',
        amount: -14990,
        memo: null,
        cleared: 'cleared',
        approved: true,
        accountId: 'acct-1',
        accountName: 'Checking',
        payeeId: null,
        payeeName: 'Netflix',
        categoryId: 'cat-1',
        categoryName: 'Streaming',
        importId: null,
        importPayeeName: null,
        importPayeeNameOriginal: null,
    };
}
