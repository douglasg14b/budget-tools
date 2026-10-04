import { describe, expect, it } from 'vitest';

import { buildYnabPatch } from '../../buildYnabPatch';
import { toSaveTransaction } from '../ynabWriteClient';

describe('toSaveTransaction', () => {
    it('forwards category, payee, memo, and flag', () => {
        expect(
            toSaveTransaction(
                buildYnabPatch('tx-1', {
                    kind: 'category',
                    categoryId: 'cat-1',
                    payeeName: 'Costco',
                    memo: 'Gift',
                    flagColor: 'red',
                }),
            ),
        ).toEqual({
            id: 'tx-1',
            approved: true,
            category_id: 'cat-1',
            payee_name: 'Costco',
            memo: 'Gift',
            flag_color: 'red',
        });
    });

    it('keeps explicit nulls and omits absent fields', () => {
        const saved = toSaveTransaction(
            buildYnabPatch('tx-1', {
                kind: 'split',
                lines: [{ amount: -1000, categoryId: 'cat-1', memo: null }],
                memo: null,
            }),
        );
        expect(saved).toEqual({
            id: 'tx-1',
            approved: true,
            category_id: null,
            memo: null,
            subtransactions: [{ amount: -1000, category_id: 'cat-1', memo: null }],
        });
        expect(saved).not.toHaveProperty('flag_color');
        expect(saved).not.toHaveProperty('payee_name');
    });

    it('sends an annotation without a category and with the mirrored approval', () => {
        const saved = toSaveTransaction(buildYnabPatch('tx-1', { kind: 'annotate', flagColor: null, approved: false }));
        expect(saved).toEqual({ id: 'tx-1', approved: false, flag_color: null });
        expect(saved).not.toHaveProperty('category_id');
        expect(saved).not.toHaveProperty('memo');
    });
});
