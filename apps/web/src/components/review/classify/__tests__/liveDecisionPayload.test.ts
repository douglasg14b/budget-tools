import type { CategorizationQueueItemDto } from '@budget-tools/web-sdk';
import { describe, expect, it } from 'vitest';

import { liveDecisionPayload } from '../liveDecisionPayload';
import type { SessionDecision } from '../sessionDecisions';
import { decideSplit } from '../sessionDecisions';

describe('liveDecisionPayload', () => {
    it('omits rejects so they never enqueue a YNAB write', () => {
        const rejected: SessionDecision = {
            kind: 'category',
            action: 'rejected',
            categoryGroup: null,
            categoryId: null,
            categoryName: null,
            transactionId: 'tx-1',
        };
        expect(liveDecisionPayload(rejected, 'Costco')).toBeNull();
    });

    it('includes a category id and optional payee rename', () => {
        const approved: SessionDecision = {
            kind: 'category',
            action: 'approved',
            categoryGroup: 'Needs',
            categoryId: 'cat-1',
            categoryName: 'Groceries',
            transactionId: 'tx-1',
        };
        expect(liveDecisionPayload(approved, undefined)).toEqual({
            transactionId: 'tx-1',
            kind: 'category',
            categoryId: 'cat-1',
        });
        expect(liveDecisionPayload(approved, '  Costco  ')).toMatchObject({ payeeName: 'Costco' });
    });

    it('maps split lines including trimmed memos', () => {
        const split: SessionDecision = {
            kind: 'split',
            action: 'changed',
            transactionId: 'tx-1',
            lines: [
                {
                    amount: -400,
                    categoryId: 'cat-1',
                    categoryName: 'Groceries',
                    categoryGroup: 'Needs',
                    memo: '  Milk  ',
                },
                {
                    amount: -600,
                    categoryId: 'cat-2',
                    categoryName: 'Household',
                    categoryGroup: 'Needs',
                    memo: '   ',
                },
            ],
        };
        expect(liveDecisionPayload(split, undefined)).toEqual({
            transactionId: 'tx-1',
            kind: 'split',
            lines: [
                { amount: -400, categoryId: 'cat-1', memo: 'Milk' },
                { amount: -600, categoryId: 'cat-2', memo: null },
            ],
        });
    });

    it('omits absent memo / flag and sends explicit clears as null', () => {
        const base: SessionDecision = {
            kind: 'category',
            action: 'approved',
            categoryGroup: 'Needs',
            categoryId: 'cat-1',
            categoryName: 'Groceries',
            transactionId: 'tx-1',
        };
        const untouched = liveDecisionPayload(base, undefined);
        expect(untouched).not.toHaveProperty('memo');
        expect(untouched).not.toHaveProperty('flagColor');
        expect(liveDecisionPayload({ ...base, memo: null, flagColor: null }, undefined)).toMatchObject({
            memo: null,
            flagColor: null,
        });
        expect(
            liveDecisionPayload({ ...base, memo: '  Gift for Sam  ', flagColor: 'purple' }, undefined),
        ).toMatchObject({ memo: 'Gift for Sam', flagColor: 'purple' });
        expect(liveDecisionPayload({ ...base, memo: '   ' }, undefined)).toMatchObject({ memo: null });
    });

    it('carries the parent memo and flag on a split', () => {
        const split: SessionDecision = {
            kind: 'split',
            action: 'changed',
            transactionId: 'tx-1',
            flagColor: 'blue',
            memo: 'Costco',
            lines: [
                { amount: -400, categoryId: 'cat-1', categoryName: 'Groceries', categoryGroup: 'Needs', memo: null },
            ],
        };
        expect(liveDecisionPayload(split, undefined)).toMatchObject({
            kind: 'split',
            memo: 'Costco',
            flagColor: 'blue',
        });
    });

    it('maps an annotation without payee, category, or lines', () => {
        const annotate: SessionDecision = {
            kind: 'annotate',
            action: 'annotated',
            transactionId: 'tx-1',
            flagColor: 'red',
        };
        expect(liveDecisionPayload(annotate, 'Costco')).toEqual({
            transactionId: 'tx-1',
            kind: 'annotate',
            flagColor: 'red',
        });
        expect(liveDecisionPayload({ ...annotate, flagColor: undefined, memo: 'Ask Jo' }, undefined)).toEqual({
            transactionId: 'tx-1',
            kind: 'annotate',
            memo: 'Ask Jo',
        });
    });

    it('drops an annotation that changes nothing', () => {
        expect(
            liveDecisionPayload({ kind: 'annotate', action: 'annotated', transactionId: 'tx-1' }, 'Costco'),
        ).toBeNull();
    });

    it('sends a one-line Amazon split memo as the parent memo of the collapsed category', () => {
        const decision = decideSplit(amazonItem(), [
            {
                amount: -1999,
                categoryId: 'cat-electronics',
                categoryName: 'Electronics',
                categoryGroup: 'Wants',
                memo: 'USB-C cable',
            },
        ]);
        expect(liveDecisionPayload(decision, undefined)).toEqual({
            transactionId: 'amzn-1',
            kind: 'category',
            categoryId: 'cat-electronics',
            memo: 'USB-C cable',
        });
    });

    it('sends line memos on a multi-category split', () => {
        const decision = decideSplit(amazonItem(), [
            {
                amount: -999,
                categoryId: 'cat-electronics',
                categoryName: 'Electronics',
                categoryGroup: 'Wants',
                memo: 'USB-C cable',
            },
            {
                amount: -1000,
                categoryId: 'cat-home',
                categoryName: 'Home',
                categoryGroup: 'Needs',
                memo: 'Dish soap',
            },
        ]);
        expect(liveDecisionPayload(decision, undefined)).toEqual({
            transactionId: 'amzn-1',
            kind: 'split',
            lines: [
                { amount: -999, categoryId: 'cat-electronics', memo: 'USB-C cable' },
                { amount: -1000, categoryId: 'cat-home', memo: 'Dish soap' },
            ],
        });
    });
});

function amazonItem(): CategorizationQueueItemDto {
    return {
        transaction: {
            id: 'amzn-1',
            date: '2026-01-15',
            amount: -1999,
            memo: null,
            cleared: 'cleared',
            approved: false,
            flagColor: null,
            flagName: null,
            accountId: 'acct-1',
            accountName: 'Checking',
            payeeId: null,
            payeeName: 'Amazon',
            categoryId: null,
            categoryName: null,
            importId: null,
            importPayeeName: null,
            importPayeeNameOriginal: null,
        },
        proposal: null,
        relatedTransactions: [],
    };
}
