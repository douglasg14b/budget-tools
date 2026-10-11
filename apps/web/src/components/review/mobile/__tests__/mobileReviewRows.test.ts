import type { CategorizationQueueItemDto } from '@budget-tools/web-sdk';
import { describe, expect, it } from 'vitest';

import { approveSuggestion, decideCategory, rejectItem } from '../../classify/sessionDecisions';
import { canQuickAccept, certainItems, decisionSummary, formatShortDate, rowCategoryLabel } from '../mobileReviewRows';

describe('certainItems', () => {
    it('keeps only 100% suggestions with a category', () => {
        const rows = [item('a', 'Groceries', 1), item('b', 'Gas', 0.97), item('c', null, 1)];
        expect(certainItems(rows).map((row) => row.transaction.id)).toEqual(['a']);
    });
});

describe('rowCategoryLabel', () => {
    it('shows the suggested category until decided, then the decision, without the group', () => {
        const row = item('a', 'Groceries', 0.9);
        expect(rowCategoryLabel(row, undefined)).toBe('Groceries');
        const decision = approveSuggestion(row);
        expect(decision && rowCategoryLabel(row, decision)).toBe('Accepted · Groceries');
    });
});

describe('decisionSummary', () => {
    it('names changes and rejections', () => {
        const row = item('a', 'Groceries', 0.9);
        const changed = decideCategory(row, { categoryGroup: 'Wants', categoryId: 'fun', categoryName: 'Fun' });
        expect(decisionSummary(changed)).toBe('Changed · Fun');
        expect(decisionSummary(rejectItem(row))).toBe('Rejected');
    });
});

describe('canQuickAccept', () => {
    it('needs an undecided row with a suggestion', () => {
        const row = item('a', 'Groceries', 0.9);
        expect(canQuickAccept(row, undefined)).toBe(true);
        expect(canQuickAccept(item('b', null, 0), undefined)).toBe(false);
        expect(canQuickAccept(row, rejectItem(row))).toBe(false);
    });
});

describe('formatShortDate', () => {
    it('drops the year for this year only', () => {
        const today = new Date(2026, 9, 10);
        expect(formatShortDate('2026-10-08', today)).toBe('Oct 8');
        expect(formatShortDate('2025-12-31', today)).toBe('Dec 31, 25');
    });
});

function item(id: string, suggestedCategory: string | null, confidence: number): CategorizationQueueItemDto {
    return {
        transaction: {
            id,
            date: '2026-01-15',
            amount: -1000,
            memo: null,
            cleared: 'cleared',
            approved: false,
            flagColor: null,
            flagName: null,
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
            transactionId: id,
            tier: suggestedCategory ? 'Suggested' : 'Blocked',
            flags: {
                isAmbiguous: false,
                isNovelImport: false,
                isExcluded: false,
                requiresManualReview: !suggestedCategory,
                isPeriodic: false,
                isPeriodicConflict: false,
                isTravelWindow: false,
            },
            suggestedCategory,
            suggestedCategoryGroup: suggestedCategory ? 'Needs' : null,
            suggestedCategoryId: suggestedCategory ? `${id}-category` : null,
            confidence,
            method: suggestedCategory ? 'Consensus' : 'Excluded',
            routeReason: 'None',
            gapReason: 'None',
            signals: [],
            agreeingSignals: [],
            options: [],
            confidenceInterval: { top: confidence, second: null, third: null, spread: 0 },
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
