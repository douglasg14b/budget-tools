import type { CategorizationQueueDto, CategorizationQueueItemDto } from '@budget-tools/web-sdk';
import { describe, expect, it } from 'vitest';

import { mergeClassifyQueue, pinFocusedQueueItem } from '../mergeClassifyQueue';

describe('mergeClassifyQueue', () => {
    const first = queue(['a', 'b'], { hasMoreNewer: true, hasMoreOlder: true });
    const older = queue(['c', 'd'], { hasMoreNewer: true, hasMoreOlder: false });
    const newer = queue(['n1', 'n0'], { hasMoreNewer: false, hasMoreOlder: true });

    it('replaces when there is no current window', () => {
        expect(mergeClassifyQueue(undefined, first, 'replace').items.map(id)).toEqual(['a', 'b']);
    });

    it('appends older items and keeps the newer edge', () => {
        const merged = mergeClassifyQueue(first, older, 'older');
        expect(merged.items.map(id)).toEqual(['a', 'b', 'c', 'd']);
        expect(merged.hasMoreNewer).toBe(true);
        expect(merged.hasMoreOlder).toBe(false);
        expect(merged.hasMore).toBe(false);
    });

    it('prepends newer items and keeps the older edge', () => {
        const merged = mergeClassifyQueue(first, newer, 'newer');
        expect(merged.items.map(id)).toEqual(['n1', 'n0', 'a', 'b']);
        expect(merged.hasMoreNewer).toBe(false);
        expect(merged.hasMoreOlder).toBe(true);
        expect(merged.hasMore).toBe(true);
    });

    it('skips duplicate ids when merging', () => {
        const overlap = queue(['b', 'c'], { hasMoreNewer: true, hasMoreOlder: false });
        expect(mergeClassifyQueue(first, overlap, 'older').items.map(id)).toEqual(['a', 'b', 'c']);
    });
});

describe('pinFocusedQueueItem', () => {
    const items = [item('a'), item('b')];

    it('returns visible items when the focused id is already present', () => {
        expect(pinFocusedQueueItem([items[0]], items, 'a').map(id)).toEqual(['a']);
    });

    it('appends the focused item when filters would hide it', () => {
        expect(pinFocusedQueueItem([items[0]], items, 'b').map(id)).toEqual(['a', 'b']);
    });
});

function queue(ids: string[], edges: { hasMoreNewer: boolean; hasMoreOlder: boolean }): CategorizationQueueDto {
    return {
        summary: { total: ids.length, autoApply: 0, suggested: 0, review: ids.length, blocked: 0 },
        generatedAt: '2026-01-01T00:00:00.000Z',
        llm: false,
        pendingCount: 20,
        scoredCount: ids.length,
        hasMore: edges.hasMoreOlder,
        hasMoreNewer: edges.hasMoreNewer,
        hasMoreOlder: edges.hasMoreOlder,
        items: ids.map(item),
    };
}

function item(idValue: string): CategorizationQueueItemDto {
    return {
        transaction: {
            id: idValue,
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
        proposal: {
            transactionId: idValue,
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
        },
        relatedTransactions: [],
    };
}

function id(entry: { transaction: { id: string } }): string {
    return entry.transaction.id;
}
