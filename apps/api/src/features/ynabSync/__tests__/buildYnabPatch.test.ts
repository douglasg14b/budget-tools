import { describe, expect, it } from 'vitest';

import { buildYnabPatch } from '../buildYnabPatch';

describe('buildYnabPatch', () => {
    it('sends an approved category assignment', () => {
        expect(buildYnabPatch('tx-1', { kind: 'category', categoryId: 'cat-1', payeeName: 'Costco' })).toEqual({
            id: 'tx-1',
            approved: true,
            category_id: 'cat-1',
            payee_name: 'Costco',
        });
    });

    it('clears the parent category and emits subtransactions for a split', () => {
        expect(
            buildYnabPatch('tx-1', {
                kind: 'split',
                lines: [
                    { amount: -400, categoryId: 'cat-1', memo: 'Milk' },
                    { amount: -600, categoryId: 'cat-2', memo: null },
                ],
            }),
        ).toEqual({
            id: 'tx-1',
            approved: true,
            category_id: null,
            subtransactions: [
                { amount: -400, category_id: 'cat-1', memo: 'Milk' },
                { amount: -600, category_id: 'cat-2', memo: null },
            ],
        });
    });

    it('sends a parent memo and flag only when the decision carries them', () => {
        expect(
            buildYnabPatch('tx-1', { kind: 'category', categoryId: 'cat-1', memo: 'Gift for Sam', flagColor: 'red' }),
        ).toEqual({ id: 'tx-1', approved: true, category_id: 'cat-1', memo: 'Gift for Sam', flag_color: 'red' });

        const withoutAnnotations = buildYnabPatch('tx-1', { kind: 'category', categoryId: 'cat-1' });
        expect(withoutAnnotations).not.toHaveProperty('memo');
        expect(withoutAnnotations).not.toHaveProperty('flag_color');
    });

    it('sends explicit nulls to clear the parent memo and flag', () => {
        expect(
            buildYnabPatch('tx-1', {
                kind: 'split',
                lines: [{ amount: -1000, categoryId: 'cat-1', memo: null }],
                memo: null,
                flagColor: null,
            }),
        ).toEqual({
            id: 'tx-1',
            approved: true,
            category_id: null,
            memo: null,
            flag_color: null,
            subtransactions: [{ amount: -1000, category_id: 'cat-1', memo: null }],
        });
    });

    it('annotates with the mirrored approval and never touches the category', () => {
        const patch = buildYnabPatch('tx-1', { kind: 'annotate', flagColor: 'purple', approved: false });
        expect(patch).toEqual({ id: 'tx-1', approved: false, flag_color: 'purple' });
        expect(patch).not.toHaveProperty('category_id');
        expect(patch).not.toHaveProperty('memo');

        expect(buildYnabPatch('tx-2', { kind: 'annotate', memo: 'What is this?', approved: true })).toEqual({
            id: 'tx-2',
            approved: true,
            memo: 'What is this?',
        });
    });
});
