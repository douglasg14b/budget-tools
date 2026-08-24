import type { CategorizationProposalDto, TransactionDetailDto } from '@budget-tools/web-sdk';
import { describe, expect, it } from 'vitest';

import {
    dismissPayeeRename,
    displayedPayeeName,
    emptyPayeeEdits,
    setPayeeName,
    visiblePayeeRename,
} from '../payeeEdits';

describe('payeeEdits', () => {
    const transaction = detail('Proton Ag');
    const proposal = proposalWithRename('Frgn Trans Fee-proton Ag* Proton Ag Ge');

    it('prefers a session name over the transaction payee', () => {
        const edits = setPayeeName(emptyPayeeEdits(), transaction.id, 'Proton');
        expect(displayedPayeeName(transaction, edits)).toBe('Proton');
        expect(visiblePayeeRename(proposal, transaction.id, 'Proton', edits)).toBeNull();
    });

    it('hides the suggestion after dismiss without changing the payee', () => {
        const edits = dismissPayeeRename(emptyPayeeEdits(), transaction.id);
        expect(displayedPayeeName(transaction, edits)).toBe('Proton Ag');
        expect(visiblePayeeRename(proposal, transaction.id, 'Proton Ag', edits)).toBeNull();
    });

    it('shows the suggestion until the displayed name matches it', () => {
        expect(visiblePayeeRename(proposal, transaction.id, 'Proton Ag', emptyPayeeEdits())?.name).toBe(
            'Frgn Trans Fee-proton Ag* Proton Ag Ge',
        );
        expect(
            visiblePayeeRename(proposal, transaction.id, 'Frgn Trans Fee-proton Ag* Proton Ag Ge', emptyPayeeEdits()),
        ).toBeNull();
    });
});

function detail(payeeName: string): TransactionDetailDto {
    return {
        id: 'tx-1',
        date: '2026-08-01',
        amount: -12000,
        memo: null,
        cleared: 'cleared',
        approved: false,
        accountId: 'acct-1',
        accountName: 'Checking',
        payeeId: null,
        payeeName,
        categoryId: null,
        categoryName: null,
        importId: null,
        importPayeeName: payeeName,
        importPayeeNameOriginal: 'FRGN TRANS FEE-PROTON AG* PROTON AG GE',
    };
}

function proposalWithRename(name: string): CategorizationProposalDto {
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
        resolvedPayee: name,
        payeeSuggestion: {
            name,
            method: 'ExactLookup',
            confidence: 1,
            needsRename: true,
        },
        notes: null,
        periodicMatch: null,
        travelWindow: null,
    };
}
