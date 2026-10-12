import type { CategorizationProposalDto, CategoryOptionDto } from '@budget-tools/web-sdk';
import { describe, expect, it } from 'vitest';

import { splitLinesFromReceiptDraft } from '../splitLines';

const transient = { id: 'cat-transient', name: '🔄 Transient / Reimbursable', groupName: 'Flex' };

describe('splitLinesFromReceiptDraft', () => {
    it('leaves item-name drafts blank for the reviewer', () => {
        const lines = splitLinesFromReceiptDraft(
            [
                { amountMilliunits: -4500, memo: 'Coffee' },
                { amountMilliunits: -3200, memo: 'Muffin' },
            ],
            proposal('cat-coffee', 'Coffee'),
        );
        expect(lines.map((line) => line.categoryId)).toEqual(['', '']);
        expect(lines.map((line) => line.memo)).toEqual(['Coffee', 'Muffin']);
    });

    it('keeps the reimbursable pick and gives the remainder the card suggestion', () => {
        expect(
            splitLinesFromReceiptDraft(
                [
                    { amountMilliunits: -54_610, memo: null, category: transient },
                    { amountMilliunits: -54_620, memo: null },
                ],
                proposal('cat-groceries', 'Groceries'),
            ),
        ).toEqual([
            {
                amount: -54_610,
                categoryId: 'cat-transient',
                categoryName: '🔄 Transient / Reimbursable',
                categoryGroup: 'Flex',
                memo: null,
            },
            {
                amount: -54_620,
                categoryId: 'cat-groceries',
                categoryName: 'Groceries',
                categoryGroup: 'Needs',
                memo: null,
            },
        ]);
    });

    it('skips a suggestion that is the reimbursable category itself (work travel)', () => {
        const lines = splitLinesFromReceiptDraft(
            [
                { amountMilliunits: -5000, memo: null, category: transient },
                { amountMilliunits: -2840, memo: null },
            ],
            proposal('cat-transient', '🔄 Transient / Reimbursable', [option('cat-dining', 'Dining Out')]),
        );
        expect(lines[1]?.categoryId).toBe('cat-dining');
    });

    it('leaves the remainder blank when there is no usable suggestion', () => {
        const lines = splitLinesFromReceiptDraft(
            [
                { amountMilliunits: -5000, memo: null, category: transient },
                { amountMilliunits: -2840, memo: null },
            ],
            null,
        );
        expect(lines[1]?.categoryId).toBe('');
    });
});

function option(categoryId: string, category: string): CategoryOptionDto {
    return { categoryId, category, categoryGroup: 'Wants', rank: 2, confidence: 0.1, supportingMethods: [] };
}

function proposal(
    suggestedCategoryId: string,
    suggestedCategory: string,
    options: CategoryOptionDto[] = [],
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
        suggestedCategory,
        suggestedCategoryGroup: 'Needs',
        suggestedCategoryId,
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
