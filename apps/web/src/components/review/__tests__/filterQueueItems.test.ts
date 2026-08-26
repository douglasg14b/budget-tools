import type { ApprovalTier, CategorizationQueueItemDto } from '@budget-tools/web-sdk';
import { describe, expect, it } from 'vitest';

import { filterQueueItems } from '../QueueLoadState';

describe('filterQueueItems', () => {
    const items = [
        item({ id: 'review', tier: 'Review' }),
        item({ id: 'unscored', tier: 'Review', scored: false }),
        item({ id: 'other-acct', tier: 'Suggested', accountId: 'acct-2' }),
    ];

    it('omits unscored items when a tier filter is active', () => {
        expect(
            filterQueueItems(items, { tiers: ['Review'], accountId: undefined }).map((entry) => entry.transaction.id),
        ).toEqual(['review']);
    });

    it('keeps unscored items when only filtering by account', () => {
        expect(
            filterQueueItems(items, { accountId: 'acct-1', tiers: undefined }).map((entry) => entry.transaction.id),
        ).toEqual(['review', 'unscored']);
    });

    it('filters by payee query', () => {
        const named = [
            item({ id: 'review', tier: 'Review' }),
            {
                ...item({ id: 'starbucks', tier: 'Suggested' }),
                transaction: {
                    ...item({ id: 'starbucks', tier: 'Suggested' }).transaction,
                    payeeName: 'Starbucks',
                },
            },
        ];
        expect(
            filterQueueItems(named, { q: 'starbucks', accountId: undefined, tiers: undefined }).map(
                (entry) => entry.transaction.id,
            ),
        ).toEqual(['starbucks']);
    });
});

function item(overrides: {
    id: string;
    tier: ApprovalTier;
    accountId?: string;
    scored?: boolean;
}): CategorizationQueueItemDto {
    return {
        transaction: {
            id: overrides.id,
            date: '2026-01-15',
            amount: -1000,
            memo: null,
            cleared: 'cleared',
            approved: false,
            accountId: overrides.accountId ?? 'acct-1',
            accountName: 'Checking',
            payeeId: null,
            payeeName: 'Store',
            categoryId: null,
            categoryName: null,
            importId: null,
            importPayeeName: null,
            importPayeeNameOriginal: null,
        },
        proposal:
            overrides.scored === false
                ? null
                : {
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
