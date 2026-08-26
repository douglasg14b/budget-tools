import { describe, expect, it } from 'vitest';

import type { CategoryGroupDto } from '../../../categories/categoriesDtos';
import type { RankedSimilarTransaction } from '../../pickSimilarTransactions';
import { assignableCategories, buildNearbyCategories, resolveAssignableCategory } from '../nearbyCategories';

describe('assignableCategories', () => {
    it('omits placeholders and hidden rows', () => {
        const catalog = assignableCategories(groups());
        expect(catalog.map((category) => category.name)).toEqual(['Streaming', 'Internet', 'Groceries']);
    });
});

describe('buildNearbyCategories', () => {
    const catalog = assignableCategories(groups());

    it('includes example categories, local options, siblings, and omits placeholders', () => {
        const nearby = buildNearbyCategories({
            catalog,
            similar: [example('Streaming', 'Monthly Bills')],
            options: [],
            periodicCategory: 'Streaming',
        });

        expect(nearby.likely.map((category) => category.name)).toEqual(['Streaming']);
        expect(nearby.siblings.map((category) => category.name)).toEqual(['Internet']);
        expect(nearby.pickList.map((category) => category.name)).toEqual(['Streaming', 'Internet', 'Groceries']);
        expect(nearby.likely[0]?.why).toContain('similar tx');
        expect(nearby.likely[0]?.why).toContain('periodic series');
    });

    it('always keeps Groceries on the pick list even when another group already fills the shortlist', () => {
        const nearby = buildNearbyCategories({
            catalog,
            similar: [example('Streaming', 'Monthly Bills')],
            options: [],
            periodicCategory: null,
        });

        expect(nearby.pickList.map((category) => category.name)).toContain('Groceries');
    });

    it('falls back to the full catalog when the shortlist is tiny', () => {
        const nearby = buildNearbyCategories({
            catalog,
            similar: [],
            options: [],
            periodicCategory: null,
        });

        expect(nearby.pickList.map((category) => category.name)).toEqual(['Streaming', 'Internet', 'Groceries']);
    });

    it('keeps Groceries on the pick list after a large sibling group fills the shortlist', () => {
        const household = Array.from({ length: 10 }, (_, index) => ({
            id: `house-${index}`,
            name: `Household ${index}`,
            hidden: false,
            note: null,
        }));
        const catalog = assignableCategories([
            {
                id: 'household',
                name: 'Household',
                hidden: false,
                categories: household,
            },
            {
                id: 'needs',
                name: 'Needs',
                hidden: false,
                categories: [{ id: 'groceries', name: 'Groceries', hidden: false, note: null }],
            },
        ]);
        const nearby = buildNearbyCategories({
            catalog,
            similar: [example('Household 0', 'Household')],
            options: [],
            periodicCategory: null,
        });

        expect(nearby.likely.map((category) => category.name)).toEqual(['Household 0']);
        expect(nearby.siblings).toHaveLength(9);
        expect(nearby.pickList.map((category) => category.name)).toContain('Groceries');
    });

    it('biases likely categories toward the Vacation group when travelWindow is vacation', () => {
        const catalog = assignableCategories([
            {
                id: 'everyday',
                name: 'Everyday',
                hidden: false,
                categories: [{ id: 'coffee', name: 'Coffee', hidden: false, note: null }],
            },
            {
                id: 'vac',
                name: '🌴 Vacation',
                hidden: false,
                categories: [
                    { id: 'vac-coffee', name: 'Vacation - Coffee', hidden: false, note: null },
                    { id: 'trips', name: '✈️ Trips + Vacations', hidden: false, note: null },
                ],
            },
        ]);
        const nearby = buildNearbyCategories({
            catalog,
            similar: [],
            options: [],
            periodicCategory: null,
            travelWindow: {
                id: 'trip-1',
                name: 'Hawaii',
                kind: 'vacation',
                targetCategory: 'Vacation - Coffee',
                location: 'Maui',
                locationMatch: 'match',
                merchantCity: 'KAHULUI',
            },
        });

        expect(nearby.likely.map((category) => category.name)).toContain('Vacation - Coffee');
        expect(nearby.likely.map((category) => category.name)).not.toContain('✈️ Trips + Vacations');
    });

    it('tags the vacation counterpart of similar everyday categories', () => {
        const catalog = assignableCategories([
            {
                id: 'everyday',
                name: 'Everyday',
                hidden: false,
                categories: [
                    { id: 'coffee', name: 'Coffee', hidden: false, note: null },
                    { id: 'outing', name: 'Outing / Theater', hidden: false, note: null },
                ],
            },
            {
                id: 'vac',
                name: '🌴 Vacation',
                hidden: false,
                categories: [
                    { id: 'vac-coffee', name: 'Vacation - Coffee', hidden: false, note: null },
                    { id: 'vac-outing', name: 'Vacation - Outing', hidden: false, note: null },
                    { id: 'trips', name: '✈️ Trips + Vacations', hidden: false, note: null },
                ],
            },
        ]);
        const nearby = buildNearbyCategories({
            catalog,
            similar: [example('Outing / Theater', 'Everyday')],
            options: [],
            periodicCategory: null,
            travelWindow: {
                id: 'trip-1',
                name: 'DefCon',
                kind: 'vacation',
                targetCategory: null,
                location: 'Las Vegas',
                locationMatch: 'unspecified',
                merchantCity: null,
            },
        });

        const outing = nearby.likely.find((category) => category.name === 'Vacation - Outing');
        expect(outing?.why).toContain('vacation counterpart of Outing / Theater');
        expect(nearby.likely.map((category) => category.name)).toContain('Outing / Theater');
    });

    it('biases likely categories toward Transient / Reimbursable when travelWindow is work', () => {
        const catalog = assignableCategories([
            {
                id: 'everyday',
                name: 'Everyday',
                hidden: false,
                categories: [{ id: 'coffee', name: 'Coffee', hidden: false, note: null }],
            },
            {
                id: 'internal',
                name: 'Internal',
                hidden: false,
                categories: [{ id: 'transient', name: '🔄 Transient / Reimbursable', hidden: false, note: null }],
            },
        ]);
        const nearby = buildNearbyCategories({
            catalog,
            similar: [],
            options: [],
            periodicCategory: null,
            travelWindow: {
                id: 'trip-2',
                name: 'Austin',
                kind: 'work',
                targetCategory: '🔄 Transient / Reimbursable',
                location: 'Austin',
                locationMatch: 'unspecified',
                merchantCity: null,
            },
        });

        expect(nearby.likely.map((category) => category.name)).toContain('🔄 Transient / Reimbursable');
    });

    it('keeps the mapped trip category on the pick list without preferring it on city mismatch', () => {
        const catalog = assignableCategories([
            {
                id: 'everyday',
                name: 'Everyday',
                hidden: false,
                categories: [{ id: 'coffee', name: 'Coffee', hidden: false, note: null }],
            },
            {
                id: 'vac',
                name: '🌴 Vacation',
                hidden: false,
                categories: [
                    { id: 'vac-coffee', name: 'Vacation - Coffee', hidden: false, note: null },
                    { id: 'trips', name: '✈️ Trips + Vacations', hidden: false, note: null },
                ],
            },
        ]);
        const nearby = buildNearbyCategories({
            catalog,
            similar: [example('Coffee', 'Everyday')],
            options: [],
            periodicCategory: null,
            travelWindow: {
                id: 'trip-3',
                name: 'Nashville',
                kind: 'vacation',
                targetCategory: 'Vacation - Coffee',
                location: 'Nashville',
                locationMatch: 'mismatch',
                merchantCity: 'SEATTLE',
            },
        });

        expect(nearby.likely.map((category) => category.name)).toEqual(['Coffee']);
        expect(nearby.likely.map((category) => category.name)).not.toContain('Vacation - Coffee');
        expect(nearby.siblings.map((category) => category.name)).toContain('Vacation - Coffee');
        expect(nearby.pickList.map((category) => category.name)).toContain('Vacation - Coffee');
    });
});

describe('resolveAssignableCategory', () => {
    const catalog = assignableCategories(groups());

    it('matches Groceries with extra whitespace', () => {
        expect(resolveAssignableCategory(catalog, '  Groceries  ', '  Needs  ')?.name).toBe('Groceries');
    });

    it('parses pipe-separated "Groceries | Needs"', () => {
        const resolved = resolveAssignableCategory(catalog, 'Groceries | Needs', null);
        expect(resolved).toEqual({ id: 'groceries', name: 'Groceries', groupName: 'Needs' });
    });

    it('parses group-first "Needs: Groceries"', () => {
        const resolved = resolveAssignableCategory(catalog, 'Needs: Groceries', null);
        expect(resolved).toEqual({ id: 'groceries', name: 'Groceries', groupName: 'Needs' });
    });

    it('parses Group / emoji Category when the left side is a known group', () => {
        const household = assignableCategories([
            {
                id: 'living',
                name: 'Living Expenses',
                hidden: false,
                categories: [{ id: 'supplies', name: '🛒 Household Supplies', hidden: false, note: null }],
            },
            {
                id: 'medical',
                name: 'Medical',
                hidden: false,
                categories: [{ id: 'med-supplies', name: '🩹 Medical - Supplies', hidden: false, note: null }],
            },
        ]);
        expect(resolveAssignableCategory(household, 'Living Expenses / 🛒 Household Supplies', null)?.id).toBe(
            'supplies',
        );
        expect(resolveAssignableCategory(household, 'Household Supplies', 'Living Expenses')?.id).toBe('supplies');
        expect(resolveAssignableCategory(household, 'Medical / 🩹 Medical - Supplies', 'Medical')?.id).toBe(
            'med-supplies',
        );
    });

    it('does not split a category whose name itself contains a slash', () => {
        const fun = assignableCategories([
            {
                id: 'fun',
                name: 'Fun',
                hidden: false,
                categories: [{ id: 'outing', name: 'Outing / Theater', hidden: false, note: null }],
            },
        ]);
        expect(resolveAssignableCategory(fun, 'Outing / Theater', 'Fun')?.id).toBe('outing');
    });
});

function example(categoryName: string, categoryGroup: string): RankedSimilarTransaction {
    return {
        id: 'ex-1',
        date: '2026-07-01',
        amount: -14990,
        accountId: 'acct-1',
        payeeId: 'payee-1',
        payeeName: 'Netflix',
        importPayeeNameOriginal: 'NETFLIX.COM',
        memo: null,
        categoryName,
        categoryGroup,
        reason: 'payeeId',
    };
}

function groups(): CategoryGroupDto[] {
    return [
        {
            id: 'bills',
            name: 'Monthly Bills',
            hidden: false,
            categories: [
                { id: 'streaming', name: 'Streaming', hidden: false, note: null },
                { id: 'internet', name: 'Internet', hidden: false, note: null },
            ],
        },
        {
            id: 'needs',
            name: 'Needs',
            hidden: false,
            categories: [{ id: 'groceries', name: 'Groceries', hidden: false, note: null }],
        },
        {
            id: 'internal',
            name: 'Internal Master Category',
            hidden: false,
            categories: [{ id: 'uncat', name: 'Uncategorized', hidden: false, note: null }],
        },
    ];
}
