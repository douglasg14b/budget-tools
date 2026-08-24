import { describe, expect, it } from 'vitest';

import type {
    CategorizationProposalDto,
    CategorizationQueueItemDto,
    PeriodicMatchDto,
    TransactionDetailDto,
} from '../categorizationDtos';
import { attachRelatedTransactions, collectRelatedTransactionIds } from '../hydrateRelatedTransactions';

describe('collectRelatedTransactionIds', () => {
    it('returns unique ids in first-seen order', () => {
        expect(
            collectRelatedTransactionIds([item(['tx-a', 'tx-b']), item(['tx-b', 'tx-c']), item([]), item(undefined)]),
        ).toEqual(['tx-a', 'tx-b', 'tx-c']);
    });
});

describe('attachRelatedTransactions', () => {
    it('keeps each item related-id order and drops missing rows', () => {
        const relatedA = transaction('tx-a');
        const relatedC = transaction('tx-c');
        const attached = attachRelatedTransactions(
            [item(['tx-c', 'tx-missing', 'tx-a']), item(undefined)],
            new Map([
                ['tx-a', relatedA],
                ['tx-c', relatedC],
            ]),
        );

        expect(attached[0]?.relatedTransactions).toEqual([relatedC, relatedA]);
        expect(attached[1]?.relatedTransactions).toEqual([]);
    });
});

function item(relatedTransactionIds: string[] | undefined): Omit<CategorizationQueueItemDto, 'relatedTransactions'> {
    return {
        transaction: transaction('pending'),
        proposal: proposal(
            relatedTransactionIds
                ? {
                      cadence: 'Monthly',
                      occurrenceCount: relatedTransactionIds.length,
                      medianAmount: -9990,
                      lastDate: '2026-07-20',
                      category: 'Streaming',
                      categoryVoteShare: 1,
                      relatedTransactionIds,
                      cadenceFit: 1,
                  }
                : null,
        ),
    };
}

function proposal(periodicMatch: PeriodicMatchDto | null): CategorizationProposalDto {
    return {
        transactionId: 'pending',
        tier: 'Suggested',
        flags: {
            isAmbiguous: false,
            isNovelImport: false,
            isExcluded: false,
            requiresManualReview: false,
            isPeriodic: periodicMatch !== null,
            isPeriodicConflict: false,
            isTravelWindow: false,
        },
        suggestedCategory: 'Streaming',
        suggestedCategoryGroup: 'Wants',
        suggestedCategoryId: 'cat-1',
        confidence: 0.9,
        method: 'PeriodicSeriesLookup',
        routeReason: 'None',
        gapReason: 'None',
        signals: [],
        agreeingSignals: [],
        options: [],
        confidenceInterval: { top: 0.9, second: null, third: null, spread: 0 },
        featureText: '',
        resolvedPayee: null,
        payeeSuggestion: null,
        notes: null,
        periodicMatch,
        travelWindow: null,
    };
}

function transaction(id: string): TransactionDetailDto {
    return {
        id,
        date: '2026-07-20',
        amount: -9990,
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
