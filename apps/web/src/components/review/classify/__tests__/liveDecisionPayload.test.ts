import { describe, expect, it } from 'vitest';

import { liveDecisionPayload } from '../liveDecisionPayload';
import type { SessionDecision } from '../sessionDecisions';

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

    it('maps split lines including memos', () => {
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
                    memo: 'Milk',
                },
                {
                    amount: -600,
                    categoryId: 'cat-2',
                    categoryName: 'Household',
                    categoryGroup: 'Needs',
                    memo: null,
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
});
