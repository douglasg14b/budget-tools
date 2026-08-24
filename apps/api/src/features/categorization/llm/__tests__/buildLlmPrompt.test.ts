import { describe, expect, it } from 'vitest';

import type { CategorizationProposalDto, TransactionDetailDto } from '../../categorizationDtos';
import type { RankedSimilarTransaction } from '../../pickSimilarTransactions';
import { buildLlmPrompt } from '../buildLlmPrompt';
import { assignableCategories, buildNearbyCategories } from '../nearbyCategories';

describe('buildLlmPrompt', () => {
    it('includes similar txs, nearby categories, and omits feature text dumps', () => {
        const similar: RankedSimilarTransaction[] = [
            {
                id: 'ex-1',
                date: '2026-07-15',
                amount: -14990,
                accountId: 'acct-1',
                payeeId: 'payee-1',
                payeeName: 'Netflix',
                importPayeeNameOriginal: 'NETFLIX.COM',
                memo: null,
                categoryName: 'Streaming',
                categoryGroup: 'Monthly Bills',
                reason: 'payeeId',
            },
        ];
        const nearby = buildNearbyCategories({
            catalog: assignableCategories([
                {
                    id: 'bills',
                    name: 'Monthly Bills',
                    hidden: false,
                    categories: [
                        { id: 'streaming', name: 'Streaming', hidden: false, note: null },
                        { id: 'internet', name: 'Internet', hidden: false, note: null },
                    ],
                },
            ]),
            similar,
            options: [],
            periodicCategory: null,
        });

        const prompt = buildLlmPrompt({
            transaction: tx(),
            proposal: proposal(),
            similar,
            nearby,
        });

        expect(prompt.user).toContain('NETFLIX.COM');
        expect(prompt.user).toContain('Streaming | Monthly Bills');
        expect(prompt.user).toContain('Internet | Monthly Bills');
        expect(prompt.user).toContain('Household payee for similar txs: Netflix');
        expect(prompt.user).not.toContain('FEATURE_BLOB');
        expect(prompt.system).toContain('categoryName is the primary pick');
        expect(prompt.system).toContain('alternateCategoryName');
        expect(prompt.system).toContain('Grocery stores');
        expect(prompt.system).toContain('use the merchant name');
        expect(prompt.system).not.toContain('Trip context');
        expect(prompt.system).not.toContain('Vacation-group');
    });

    it('adds a travel instruction only when proposal.travelWindow is set', () => {
        const nearby = buildNearbyCategories({
            catalog: assignableCategories([]),
            similar: [],
            options: [],
            periodicCategory: null,
        });
        const withTravel = buildLlmPrompt({
            transaction: tx(),
            proposal: {
                ...proposal(),
                travelWindow: {
                    id: 'trip-1',
                    name: 'Hawaii',
                    kind: 'vacation',
                    targetCategory: 'Vacation - Coffee',
                    location: null,
                    locationMatch: 'unspecified',
                    merchantCity: null,
                },
            },
            similar: [],
            nearby,
        });
        const withoutTravel = buildLlmPrompt({
            transaction: tx(),
            proposal: proposal(),
            similar: [],
            nearby,
        });

        expect(withTravel.system).toContain('Hawaii');
        expect(withTravel.system).toContain('by date and card');
        expect(withTravel.system).toContain('Vacation-group');
        expect(withTravel.system).toContain('alternateCategoryName');
        expect(withTravel.system).toContain('Never set alternateCategoryName to null');
        expect(withTravel.user).toContain('Trip context');
        expect(withTravel.user).toContain('Hawaii');
        expect(withTravel.user).toContain('Always return two pick-list categories');
        expect(withoutTravel.system).not.toContain('Hawaii');
        expect(withoutTravel.user).not.toContain('Trip context');
    });

    it('tells the model the trip category is allowed but not assumed on city mismatch', () => {
        const nearby = buildNearbyCategories({
            catalog: assignableCategories([]),
            similar: [],
            options: [],
            periodicCategory: null,
        });
        const prompt = buildLlmPrompt({
            transaction: tx(),
            proposal: {
                ...proposal(),
                travelWindow: {
                    id: 'trip-1',
                    name: 'Nashville',
                    kind: 'vacation',
                    targetCategory: 'Vacation - Coffee',
                    location: 'Nashville',
                    locationMatch: 'mismatch',
                    merchantCity: 'SEATTLE',
                },
            },
            similar: [],
            nearby,
        });

        expect(prompt.system).toContain('Nashville');
        expect(prompt.system).toContain('SEATTLE');
        expect(prompt.system).toContain('Do not assume the trip category');
        expect(prompt.system).toContain('Vacation - Coffee remains allowed');
        expect(prompt.system).not.toContain('Prefer a Vacation-group');
    });
});

function tx(): TransactionDetailDto {
    return {
        id: 'pending',
        date: '2026-08-15',
        amount: -14990,
        memo: null,
        cleared: 'cleared',
        approved: false,
        accountId: 'acct-1',
        accountName: 'Checking',
        payeeId: 'payee-1',
        payeeName: 'NETFLIX.COM',
        categoryId: null,
        categoryName: null,
        importId: null,
        importPayeeName: 'NETFLIX.COM',
        importPayeeNameOriginal: 'NETFLIX.COM',
    };
}

function proposal(): CategorizationProposalDto {
    return {
        transactionId: 'pending',
        tier: 'Review',
        flags: {
            isAmbiguous: false,
            isNovelImport: true,
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
        method: 'None',
        routeReason: 'NovelImportString',
        gapReason: 'NoQualifiedSignals',
        signals: [],
        agreeingSignals: [],
        options: [],
        confidenceInterval: { top: 0, second: null, third: null, spread: 0 },
        featureText: 'FEATURE_BLOB',
        resolvedPayee: null,
        payeeSuggestion: null,
        notes: null,
        periodicMatch: null,
        travelWindow: null,
    };
}
