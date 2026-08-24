import type { CategorizationQueueItemDto } from '@budget-tools/web-sdk';
import { describe, expect, it } from 'vitest';

import {
    applyDecision,
    approveSuggestion,
    decideCategory,
    emptySession,
    nextRemainingId,
    nextRowId,
    previousRemainingId,
    previousRowId,
    rejectItem,
    remainingItems,
    tallySession,
    undoLast,
} from '../sessionDecisions';

describe('sessionDecisions', () => {
    const first = item('a', 'Groceries', 'cat-1');
    const second = item('b', 'Dining', 'cat-2');
    const third = item('c', null, null);
    const items = [first, second, third];

    it('applies, overwrites, and undoes in stack order', () => {
        let session = emptySession();
        const approved = approveSuggestion(first);
        expect(approved).toBeDefined();
        if (!approved) {
            return;
        }
        session = applyDecision(session, approved);
        session = applyDecision(session, rejectItem(second));
        expect(tallySession(items, session)).toEqual({
            accepted: 1,
            changed: 0,
            decided: 2,
            rejected: 1,
            remaining: 1,
        });

        session = applyDecision(session, rejectItem(first));
        expect(session.byId.a?.action).toBe('rejected');
        expect(session.undoStack).toEqual(['a', 'b']);

        session = undoLast(session);
        expect(session.byId.b).toBeUndefined();
        expect(session.byId.a?.action).toBe('rejected');
        session = undoLast(session);
        expect(session).toEqual(emptySession());
    });

    it('treats a pick of the suggested category as approved', () => {
        expect(
            decideCategory(first, { categoryGroup: 'Needs', categoryId: 'cat-1', categoryName: 'Groceries' }).action,
        ).toBe('approved');
        expect(
            decideCategory(first, { categoryGroup: 'Wants', categoryId: 'cat-9', categoryName: 'Dining' }).action,
        ).toBe('changed');
    });

    it('walks remaining items forward and backward, skipping decided rows', () => {
        const session = applyDecision(emptySession(), rejectItem(second));
        expect(remainingItems(items, session).map((entry) => entry.transaction.id)).toEqual(['a', 'c']);
        expect(nextRemainingId(items, session, 'a')).toBe('c');
        expect(nextRemainingId(items, session, 'c')).toBe('a');
        expect(previousRemainingId(items, session, 'a')).toBe('c');
    });

    it('walks adjacent table rows without wrapping or skipping', () => {
        expect(nextRowId(items, 'a')).toBe('b');
        expect(nextRowId(items, 'c')).toBeUndefined();
        expect(previousRowId(items, 'b')).toBe('a');
        expect(previousRowId(items, 'a')).toBeUndefined();
    });

    it('does not approve when there is no suggestion', () => {
        expect(approveSuggestion(third)).toBeUndefined();
    });
});

function item(
    id: string,
    suggestedCategory: string | null,
    suggestedCategoryId: string | null,
): CategorizationQueueItemDto {
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
            suggestedCategoryId,
            confidence: suggestedCategory ? 0.8 : 0,
            method: suggestedCategory ? 'Consensus' : 'Excluded',
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
