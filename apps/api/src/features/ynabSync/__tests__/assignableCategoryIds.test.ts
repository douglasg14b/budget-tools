import { describe, expect, it } from 'vitest';

import { assignableCategoryIds } from '../assignableCategoryIds';

describe('assignableCategoryIds', () => {
    it('accepts Ready to Assign and rejects the other placeholders and hidden rows', () => {
        const ids = assignableCategoryIds({
            groups: [
                {
                    id: 'internal',
                    name: 'Internal Master Category',
                    hidden: false,
                    categories: [
                        { id: 'uncat', name: 'Uncategorized', hidden: false, note: null },
                        { id: 'deferred', name: 'Deferred Income SubCategory', hidden: false, note: null },
                        { id: 'rta', name: 'Inflow: Ready to Assign', hidden: false, note: null },
                    ],
                },
                {
                    id: 'bills',
                    name: 'Monthly Bills',
                    hidden: false,
                    categories: [
                        { id: 'internet', name: 'Internet', hidden: false, note: null },
                        { id: 'old', name: 'Old', hidden: true, note: null },
                    ],
                },
                {
                    id: 'hidden-group',
                    name: 'Hidden',
                    hidden: true,
                    categories: [{ id: 'nope', name: 'Nope', hidden: false, note: null }],
                },
            ],
        });

        expect([...ids].sort()).toEqual(['internet', 'rta']);
    });
});
