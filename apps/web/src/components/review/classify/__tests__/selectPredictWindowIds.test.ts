import type { CategorizationProposalDto, CategorizationQueueItemDto } from '@budget-tools/web-sdk';
import { describe, expect, it } from 'vitest';

import { PREDICT_WINDOW_SIZE, selectPredictWindowIds } from '../selectPredictWindowIds';

describe('selectPredictWindowIds', () => {
    it('returns unscored ids in a clamped window around the focus', () => {
        const items = [scored('n0'), unscored('n1'), unscored('n2'), scored('n3'), unscored('n4'), unscored('n5')];
        expect(selectPredictWindowIds(items, 'n3', 5)).toEqual(['n1', 'n2', 'n4', 'n5']);
    });

    it('clamps at the newest end', () => {
        const items = [unscored('n0'), unscored('n1'), scored('n2'), unscored('n3')];
        expect(selectPredictWindowIds(items, 'n0', 3)).toEqual(['n0', 'n1']);
    });

    it('returns nothing when every item in the window is already scored', () => {
        expect(selectPredictWindowIds([scored('a'), scored('b'), scored('c')], 'b', PREDICT_WINDOW_SIZE)).toEqual([]);
    });

    it('returns nothing when the focus is not in the list', () => {
        expect(selectPredictWindowIds([unscored('a')], 'gone')).toEqual([]);
    });
});

function scored(id: string): CategorizationQueueItemDto {
    return {
        transaction: {
            id,
            date: '2026-01-15',
            amount: -1000,
            memo: null,
            cleared: 'cleared',
            approved: false,
            accountId: 'acct-1',
            accountName: 'Checking',
            payeeId: null,
            payeeName: 'Store',
            categoryId: null,
            categoryName: null,
            importId: null,
            importPayeeName: null,
            importPayeeNameOriginal: null,
        },
        proposal: proposal(id),
        relatedTransactions: [],
    };
}

function unscored(id: string): CategorizationQueueItemDto {
    return { ...scored(id), proposal: null };
}

function proposal(transactionId: string): CategorizationProposalDto {
    return {
        transactionId,
        tier: 'Review',
        flags: {
            isAmbiguous: false,
            isNovelImport: false,
            isExcluded: false,
            requiresManualReview: false,
            isPeriodic: false,
            isPeriodicConflict: false,
            isTravelWindow: false,
        },
        suggestedCategory: 'Groceries',
        suggestedCategoryGroup: 'Needs',
        suggestedCategoryId: 'cat-1',
        confidence: 0.8,
        method: 'Consensus',
        routeReason: 'None',
        gapReason: 'None',
        signals: [],
        agreeingSignals: [],
        options: [],
        confidenceInterval: { top: 0.8, second: null, third: null, spread: 0 },
        featureText: '',
        resolvedPayee: null,
        payeeSuggestion: null,
        notes: null,
        periodicMatch: null,
        travelWindow: null,
    };
}
