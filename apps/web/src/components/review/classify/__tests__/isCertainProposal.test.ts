import type { CategorizationProposalDto } from '@budget-tools/web-sdk';
import { describe, expect, it } from 'vitest';
import { isCertainProposal } from '../isCertainProposal';

describe('isCertainProposal', () => {
    it('is true only at whole-number 100% with a suggested category', () => {
        expect(isCertainProposal(proposal({ confidence: 1, suggestedCategory: 'Groceries' }))).toBe(true);
        expect(isCertainProposal(proposal({ confidence: 0.995, suggestedCategory: 'Groceries' }))).toBe(true);
        expect(isCertainProposal(proposal({ confidence: 0.994, suggestedCategory: 'Groceries' }))).toBe(false);
        expect(isCertainProposal(proposal({ confidence: 1, suggestedCategory: null }))).toBe(false);
        expect(isCertainProposal(null)).toBe(false);
        expect(isCertainProposal(undefined)).toBe(false);
    });
});

function proposal(overrides: { confidence: number; suggestedCategory: string | null }): CategorizationProposalDto {
    return {
        transactionId: 'tx-1',
        tier: 'AutoApply',
        flags: {
            isAmbiguous: false,
            isNovelImport: false,
            isExcluded: false,
            requiresManualReview: false,
            isPeriodic: false,
            isPeriodicConflict: false,
            isTravelWindow: false,
        },
        suggestedCategory: overrides.suggestedCategory,
        suggestedCategoryGroup: 'Needs',
        suggestedCategoryId: 'cat-1',
        confidence: overrides.confidence,
        method: 'Consensus',
        routeReason: 'None',
        gapReason: 'None',
        signals: [],
        agreeingSignals: [],
        options: [],
        confidenceInterval: { top: overrides.confidence, second: null, third: null, spread: 0 },
        featureText: '',
        resolvedPayee: null,
        payeeSuggestion: null,
        notes: null,
        periodicMatch: null,
        travelWindow: null,
    };
}
