import type { CategorizationProposalDto, CategoryOptionDto } from '@budget-tools/web-sdk';
import { describe, expect, it } from 'vitest';

import { alternativeOptions } from '../alternativeOptions';

describe('alternativeOptions', () => {
    it('excludes the suggested category and keeps the next three', () => {
        const proposal = proposalWithOptions([
            option({ rank: 1, category: 'Groceries', categoryId: 'cat-1' }),
            option({ rank: 2, category: 'Dining', categoryId: 'cat-2' }),
            option({ rank: 3, category: 'Gas', categoryId: 'cat-3' }),
            option({ rank: 4, category: 'Parking', categoryId: 'cat-4' }),
            option({ rank: 5, category: 'Gifts', categoryId: 'cat-5' }),
        ]);

        expect(alternativeOptions(proposal).map((item) => item.category)).toEqual(['Dining', 'Gas', 'Parking']);
    });

    it('matches the suggestion by name when ids are missing', () => {
        const proposal = proposalWithOptions(
            [
                option({ rank: 1, category: 'Groceries', categoryId: null }),
                option({ rank: 2, category: 'Dining', categoryId: null }),
            ],
            { suggestedCategoryId: null },
        );

        expect(alternativeOptions(proposal).map((item) => item.category)).toEqual(['Dining']);
    });
});

function proposalWithOptions(
    options: CategoryOptionDto[],
    overrides: Partial<Pick<CategorizationProposalDto, 'suggestedCategory' | 'suggestedCategoryId'>> = {},
): CategorizationProposalDto {
    return {
        transactionId: 'tx-1',
        tier: 'Suggested',
        flags: {
            isAmbiguous: false,
            isNovelImport: false,
            isExcluded: false,
            requiresManualReview: false,
            isPeriodic: false,
            isPeriodicConflict: false,
            isTravelWindow: false,
        },
        suggestedCategory: overrides.suggestedCategory ?? 'Groceries',
        suggestedCategoryGroup: 'Needs',
        suggestedCategoryId: overrides.suggestedCategoryId === undefined ? 'cat-1' : overrides.suggestedCategoryId,
        confidence: 0.8,
        method: 'Consensus',
        routeReason: 'None',
        gapReason: 'None',
        signals: [],
        agreeingSignals: [],
        options,
        confidenceInterval: { top: 0.8, second: 0.1, third: null, spread: 0.7 },
        featureText: '',
        resolvedPayee: null,
        payeeSuggestion: null,
        notes: null,
        periodicMatch: null,
        travelWindow: null,
    };
}

function option(overrides: { category: string; categoryId: string | null; rank: number }): CategoryOptionDto {
    return {
        rank: overrides.rank,
        category: overrides.category,
        categoryGroup: 'Needs',
        categoryId: overrides.categoryId,
        confidence: 0.4,
        supportingMethods: [],
    };
}
