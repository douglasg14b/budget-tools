import { describe, expect, it } from 'vitest';

import type { CategorizationQueueItemDto } from '../categorizationDtos';
import { filterAndSortQueueItems, parseTierFilter, QueryValidationError } from '../filterQueue';

function item(overrides: {
    id: string;
    tier: CategorizationQueueItemDto['proposal']['tier'];
    date: string;
    accountId?: string;
}): CategorizationQueueItemDto {
    return {
        transaction: {
            id: overrides.id,
            date: overrides.date,
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

describe('parseTierFilter', () => {
    it('returns undefined for a missing or blank value', () => {
        expect(parseTierFilter(undefined)).toBeUndefined();
        expect(parseTierFilter('  ')).toBeUndefined();
    });

    it('parses a comma-separated list', () => {
        expect(parseTierFilter('Review, Blocked')).toEqual(['Review', 'Blocked']);
    });

    it('throws on an unknown tier', () => {
        expect(() => parseTierFilter('Nope')).toThrow(QueryValidationError);
    });
});

describe('filterAndSortQueueItems', () => {
    const items = [
        item({ id: 'review-old', tier: 'Review', date: '2024-01-01' }),
        item({ id: 'auto-new', tier: 'AutoApply', date: '2024-06-01' }),
        item({ id: 'auto-old', tier: 'AutoApply', date: '2024-01-15' }),
        item({ id: 'blocked', tier: 'Blocked', date: '2024-03-01', accountId: 'acct-2' }),
        item({ id: 'suggested', tier: 'Suggested', date: '2024-02-01' }),
    ];

    it('sorts by tier priority then date descending', () => {
        const sorted = filterAndSortQueueItems(items, {});
        expect(sorted.map((entry) => entry.transaction.id)).toEqual([
            'auto-new',
            'auto-old',
            'suggested',
            'review-old',
            'blocked',
        ]);
    });

    it('filters by tier', () => {
        const filtered = filterAndSortQueueItems(items, { tiers: ['Review', 'Blocked'] });
        expect(filtered.map((entry) => entry.transaction.id)).toEqual(['review-old', 'blocked']);
    });

    it('filters by accountId', () => {
        const filtered = filterAndSortQueueItems(items, { accountId: 'acct-2' });
        expect(filtered.map((entry) => entry.transaction.id)).toEqual(['blocked']);
    });
});
