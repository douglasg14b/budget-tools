import { describe, expect, it } from 'vitest';

import type { CategorizationProposalDto } from '../categorizationDtos';
import { summarizeQueue } from '../summarizeQueue';

describe('summarizeQueue', () => {
    it('counts each approval tier', () => {
        expect(
            summarizeQueue([
                proposal('AutoApply'),
                proposal('AutoApply'),
                proposal('Suggested'),
                proposal('Review'),
                proposal('Blocked'),
            ]),
        ).toEqual({
            total: 5,
            autoApply: 2,
            suggested: 1,
            review: 1,
            blocked: 1,
        });
    });
});

function proposal(tier: CategorizationProposalDto['tier']): CategorizationProposalDto {
    return {
        transactionId: tier,
        tier,
        flags: {
            isAmbiguous: false,
            isNovelImport: false,
            isExcluded: false,
            requiresManualReview: false,
            isPeriodic: false,
            isPeriodicConflict: false,
            isTravelWindow: false,
        },
        suggestedCategory: null,
        suggestedCategoryGroup: null,
        suggestedCategoryId: null,
        confidence: 0,
        method: 'None',
        routeReason: 'None',
        gapReason: 'None',
        signals: [],
        agreeingSignals: [],
        options: [],
        confidenceInterval: { top: 0, second: null, third: null, spread: 0 },
        featureText: '',
        resolvedPayee: null,
        payeeSuggestion: null,
        notes: null,
        periodicMatch: null,
        travelWindow: null,
    };
}
