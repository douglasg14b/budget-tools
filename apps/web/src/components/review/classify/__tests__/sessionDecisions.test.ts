import type { CategorizationQueueItemDto } from '@budget-tools/web-sdk';
import { describe, expect, it } from 'vitest';

import {
    annotateItem,
    applyDecision,
    approveSuggestion,
    decideCategory,
    decideSplit,
    emptySession,
    isSplitDecision,
    nextRemainingId,
    nextRowId,
    previousRemainingId,
    previousRowId,
    rejectItem,
    remainingItems,
    removeDecision,
    resolveClassifyFocus,
    tallySession,
    undoLast,
} from '../sessionDecisions';
import type { SplitLine } from '../splitLines';

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
            skipped: 0,
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
            decideCategory(first, { categoryGroup: 'Needs', categoryId: 'cat-1', categoryName: 'Groceries' }),
        ).toMatchObject({ kind: 'category', action: 'approved' });
        expect(
            decideCategory(first, { categoryGroup: 'Wants', categoryId: 'cat-9', categoryName: 'Dining' }).action,
        ).toBe('changed');
    });

    it('walks remaining items forward and backward, skipping decided rows', () => {
        const session = applyDecision(emptySession(), rejectItem(second));
        expect(remainingItems(items, session).map((entry) => entry.transaction.id)).toEqual(['a', 'c']);
        expect(nextRemainingId(items, session, 'a')).toBe('c');
        expect(nextRemainingId(items, session, 'c')).toBeUndefined();
        expect(previousRemainingId(items, session, 'a')).toBeUndefined();
    });

    it('walks adjacent table rows without wrapping or skipping', () => {
        expect(nextRowId(items, 'a')).toBe('b');
        expect(nextRowId(items, 'c')).toBeUndefined();
        expect(previousRowId(items, 'b')).toBe('a');
        expect(previousRowId(items, 'a')).toBeUndefined();
    });

    it('removes a specific decision without requiring it to be last', () => {
        const approved = approveSuggestion(first);
        expect(approved).toBeDefined();
        if (!approved) {
            return;
        }
        let session = applyDecision(emptySession(), approved);
        session = applyDecision(session, rejectItem(second));
        session = removeDecision(session, first.transaction.id);
        expect(session.byId.a).toBeUndefined();
        expect(session.byId.b?.action).toBe('rejected');
        expect(session.undoStack).toEqual(['b']);
    });

    it('does not approve when there is no suggestion', () => {
        expect(approveSuggestion(third)).toBeUndefined();
    });

    it('stores mixed split lines and collapses a same-category split', () => {
        const mixed = decideSplit(first, [
            {
                amount: -400,
                categoryId: 'cat-1',
                categoryName: 'Groceries',
                categoryGroup: 'Needs',
                memo: 'Milk',
            },
            {
                amount: -600,
                categoryId: 'cat-2',
                categoryName: 'Household',
                categoryGroup: 'Needs',
                memo: 'Soap',
            },
        ]);
        expect(isSplitDecision(mixed)).toBe(true);
        if (mixed.kind !== 'split') {
            throw new Error('expected split decision');
        }
        expect(mixed.lines).toHaveLength(2);

        const collapsed = decideSplit(first, [
            {
                amount: -400,
                categoryId: 'cat-1',
                categoryName: 'Groceries',
                categoryGroup: 'Needs',
                memo: 'Milk',
            },
            {
                amount: -600,
                categoryId: 'cat-1',
                categoryName: 'Groceries',
                categoryGroup: 'Needs',
                memo: 'Eggs',
            },
        ]);
        expect(collapsed).toMatchObject({ kind: 'category', categoryId: 'cat-1', action: 'approved' });
    });

    it('carries a one-line Amazon split memo onto the collapsed category decision', () => {
        const amazon = decideSplit(first, [line('cat-1', 'USB-C cable')]);
        expect(amazon).toMatchObject({ kind: 'category', categoryId: 'cat-1', memo: 'USB-C cable' });
    });

    it('joins collapsed line memos after the parent memo without duplicating it', () => {
        const lines = [line('cat-1', ' Milk '), line('cat-1', null), line('cat-1', 'Eggs')];
        expect(decideSplit(withMemo(first, 'Costco run'), lines)).toMatchObject({ memo: 'Costco run; Milk; Eggs' });
        expect(decideSplit(withMemo(first, 'Costco run; Milk; Eggs'), lines)).not.toHaveProperty('memo');
        expect(
            decideSplit(withMemo(first, 'Weekly: Milk; Eggs'), lines, { memo: 'Weekly: Milk; Eggs!' }),
        ).toMatchObject({ memo: 'Weekly: Milk; Eggs!' });
        expect(decideSplit(withMemo(first, 'Costco run'), lines, { memo: null })).toMatchObject({
            memo: 'Milk; Eggs',
        });
    });

    it('leaves the memo out of a collapsed split with no line memos and an untouched note', () => {
        expect(decideSplit(withMemo(first, 'Costco'), [line('cat-1', null), line('cat-1', '  ')])).not.toHaveProperty(
            'memo',
        );
        expect(decideSplit(first, [line('cat-1', null)], { memo: 'Gift', flagColor: 'red' })).toMatchObject({
            kind: 'category',
            memo: 'Gift',
            flagColor: 'red',
        });
    });

    it('caps a collapsed memo at the YNAB limit with an ellipsis', () => {
        const collapsed = decideSplit(withMemo(first, 'x'.repeat(490)), [line('cat-1', 'USB-C cable')]);
        expect(collapsed.kind).toBe('category');
        const memo = collapsed.kind === 'category' ? collapsed.memo : undefined;
        expect(memo).toHaveLength(500);
        expect(memo?.endsWith('…')).toBe(true);
    });

    it('keeps line memos on a real multi-category split and puts only the note on the parent', () => {
        const split = decideSplit(first, [line('cat-1', 'Milk'), line('cat-2', 'Soap')], { memo: 'Costco' });
        expect(split).toMatchObject({ kind: 'split', memo: 'Costco' });
        expect(split.kind === 'split' ? split.lines.map((entry) => entry.memo) : []).toEqual(['Milk', 'Soap']);
    });

    it('annotates only when the note changes something, and tallies it as skipped', () => {
        expect(annotateItem(first, {})).toBeUndefined();
        const annotated = annotateItem(first, { flagColor: 'red' });
        expect(annotated).toEqual({ kind: 'annotate', action: 'annotated', transactionId: 'a', flagColor: 'red' });
        if (!annotated) {
            return;
        }
        let session = applyDecision(emptySession(), annotated);
        expect(tallySession(items, session)).toEqual({
            accepted: 0,
            changed: 0,
            decided: 1,
            rejected: 0,
            remaining: 2,
            skipped: 1,
        });
        expect(remainingItems(items, session).map((entry) => entry.transaction.id)).toEqual(['b', 'c']);
        session = undoLast(session);
        expect(session).toEqual(emptySession());
    });

    it('keeps an in-list currentId when the URL id is stale', () => {
        expect(
            resolveClassifyFocus({
                currentId: 'b',
                items,
                requestedId: 'a',
                session: emptySession(),
            }),
        ).toBe('b');
    });

    it('adopts requestedId once it appears in the loaded window', () => {
        expect(
            resolveClassifyFocus({
                currentId: 'gone',
                items,
                requestedId: 'c',
                session: emptySession(),
            }),
        ).toBe('c');
    });

    it('does not snap to the first row while a missing URL id is still loading', () => {
        expect(
            resolveClassifyFocus({
                currentId: 'gone',
                items,
                requestedId: 'gone',
                session: emptySession(),
            }),
        ).toBe('gone');
        expect(
            resolveClassifyFocus({
                currentId: 'gone',
                items: [],
                requestedId: 'gone',
                session: emptySession(),
            }),
        ).toBe('gone');
    });
});

function line(categoryId: string, memo: string | null): SplitLine {
    return {
        amount: -500,
        categoryId,
        categoryName: categoryId === 'cat-1' ? 'Groceries' : 'Household',
        categoryGroup: 'Needs',
        memo,
    };
}

function withMemo(source: CategorizationQueueItemDto, memo: string | null): CategorizationQueueItemDto {
    return { ...source, transaction: { ...source.transaction, memo } };
}

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
