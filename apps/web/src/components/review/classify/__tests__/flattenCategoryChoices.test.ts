import { describe, expect, it } from 'vitest';

import { categorySelectGroups, flattenCategoryChoices } from '../flattenCategoryChoices';

describe('flattenCategoryChoices', () => {
    it('omits hidden groups and categories', () => {
        const choices = flattenCategoryChoices([
            {
                id: 'g-hidden',
                name: 'Hidden group',
                hidden: true,
                categories: [{ id: 'c-1', name: 'Nope', hidden: false, note: null }],
            },
            {
                id: 'g-needs',
                name: 'Needs',
                hidden: false,
                categories: [
                    { id: 'c-groc', name: 'Groceries', hidden: false, note: null },
                    { id: 'c-hide', name: 'Old', hidden: true, note: null },
                ],
            },
        ]);

        expect(choices).toEqual([{ groupName: 'Needs', id: 'c-groc', name: 'Groceries' }]);
        expect(categorySelectGroups(choices)).toEqual([
            { group: 'Needs', items: [{ label: 'Groceries', value: 'c-groc' }] },
        ]);
    });

    it('omits YNAB placeholder groups and category names', () => {
        const choices = flattenCategoryChoices([
            {
                id: 'g-internal',
                name: 'Internal Master Category',
                hidden: false,
                categories: [
                    { id: 'c-uncat', name: 'Uncategorized', hidden: false, note: null },
                    { id: 'c-rta', name: 'Ready to Assign', hidden: false, note: null },
                ],
            },
            {
                id: 'g-inflow',
                name: 'Inflow',
                hidden: false,
                categories: [{ id: 'c-inflow', name: 'Inflow: Ready to Assign', hidden: false, note: null }],
            },
            {
                id: 'g-needs',
                name: 'Needs',
                hidden: false,
                categories: [{ id: 'c-groc', name: 'Groceries', hidden: false, note: null }],
            },
        ]);

        expect(choices).toEqual([{ groupName: 'Needs', id: 'c-groc', name: 'Groceries' }]);
    });
});
