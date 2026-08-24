import type { CategorizationQueueItemDto } from '@budget-tools/web-sdk';
import { describe, expect, it } from 'vitest';

import { sortQueueItemsByDateDesc } from '../sortQueueItems';

describe('sortQueueItemsByDateDesc', () => {
    it('orders by date descending, then id, regardless of tier', () => {
        const items = [
            item({ id: 'review-aug-21', date: '2026-08-21', tier: 'Review' }),
            item({ id: 'auto-jul-27', date: '2026-07-27', tier: 'AutoApply' }),
            item({ id: 'suggested-aug-03', date: '2026-08-03', tier: 'Suggested' }),
            item({ id: 'auto-aug-21-a', date: '2026-08-21', tier: 'AutoApply' }),
            item({ id: 'auto-aug-21-b', date: '2026-08-21', tier: 'AutoApply' }),
        ];

        expect(sortQueueItemsByDateDesc(items).map((entry) => entry.transaction.id)).toEqual([
            'auto-aug-21-a',
            'auto-aug-21-b',
            'review-aug-21',
            'suggested-aug-03',
            'auto-jul-27',
        ]);
    });
});

function item(overrides: {
    id: string;
    date: string;
    tier: CategorizationQueueItemDto['proposal']['tier'];
}): CategorizationQueueItemDto {
    return {
        transaction: {
            id: overrides.id,
            date: overrides.date,
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
        proposal: {
            transactionId: overrides.id,
            tier: overrides.tier,
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
            confidence: 0.9,
            method: 'Consensus',
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
            periodicMatch: null,
            travelWindow: null,
        },
        relatedTransactions: [],
    };
}
