import type { CategorizationProposalDto } from '@budget-tools/web-sdk';
import { describe, expect, it } from 'vitest';

import { payeeRenameSuggestion } from '../payeeRenameSuggestion';

describe('payeeRenameSuggestion', () => {
    it('returns the suggestion only when a rename is needed', () => {
        expect(payeeRenameSuggestion(proposal({ needsRename: true, name: 'Stumptown' }))).toEqual({
            name: 'Stumptown',
            method: 'ExactLookup',
            confidence: 1,
            needsRename: true,
        });
        expect(payeeRenameSuggestion(proposal({ needsRename: false, name: 'Safeway' }))).toBeNull();
        expect(payeeRenameSuggestion(proposal({ needsRename: true, name: '  ' }))).toBeNull();
    });
});

function proposal(overrides: { needsRename: boolean; name: string }): CategorizationProposalDto {
    return {
        transactionId: 'tx-1',
        tier: 'Review',
        flags: {
            isAmbiguous: false,
            isNovelImport: false,
            isExcluded: false,
            requiresManualReview: true,
            isPeriodic: false,
            isPeriodicConflict: false,
            isTravelWindow: false,
        },
        suggestedCategory: null,
        suggestedCategoryGroup: null,
        suggestedCategoryId: null,
        confidence: 0,
        method: 'Excluded',
        routeReason: 'ExcludedPayee',
        gapReason: 'Excluded',
        signals: [],
        agreeingSignals: [],
        options: [],
        confidenceInterval: { top: 0, second: null, third: null, spread: 0 },
        featureText: '',
        resolvedPayee: overrides.name,
        payeeSuggestion: {
            name: overrides.name,
            method: 'ExactLookup',
            confidence: 1,
            needsRename: overrides.needsRename,
        },
        notes: null,
        periodicMatch: null,
        travelWindow: null,
    };
}
