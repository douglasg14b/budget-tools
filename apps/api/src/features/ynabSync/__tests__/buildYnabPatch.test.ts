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
});
