import type {
    CategorizationProposalDto,
    CategorizationQueueItemDto,
    LlmSuggestOverlayDto,
} from '@budget-tools/web-sdk';
import { describe, expect, it } from 'vitest';

import {
    applyLlmOverlay,
    needsAmazonSuggest,
    needsLlmSuggest,
    nextUncertainRemaining,
    previousUncertainRemaining,
    selectAmazonPrefetchNeighbors,
    selectLlmPrefetchNeighbors,
} from '../applyLlmOverlay';

describe('needsLlmSuggest', () => {
    it('skips decided items and locally certain proposals', () => {
        expect(needsLlmSuggest(item({ confidence: 0.4, suggestedCategory: 'Groceries' }), true)).toBe(false);
        expect(needsLlmSuggest(item({ confidence: 1, suggestedCategory: 'Groceries' }), false)).toBe(false);
        expect(needsLlmSuggest(item({ confidence: 0.4, suggestedCategory: 'Groceries' }), false)).toBe(true);
        expect(needsLlmSuggest(item({ confidence: 1, suggestedCategory: null }), false)).toBe(true);
        expect(needsLlmSuggest(unscored('u'), false)).toBe(false);
    });

    it('skips Amazon payees so they use the Amazon split overlay', () => {
        const amazon = amazonItem('amz');
        expect(needsLlmSuggest(amazon, false)).toBe(false);
        expect(needsAmazonSuggest(amazon, false)).toBe(true);
        expect(needsAmazonSuggest(amazon, true)).toBe(true);
        expect(needsAmazonSuggest(item({ confidence: 0.4, suggestedCategory: 'Groceries' }), false)).toBe(false);
    });
});

describe('nextUncertainRemaining', () => {
    it('prefetches the next remaining uncertain item only', () => {
        const current = item({ id: 'a', confidence: 0.4, suggestedCategory: 'Groceries' });
        const certain = item({ id: 'b', confidence: 1, suggestedCategory: 'Dining' });
        const next = item({ id: 'c', confidence: 0.2, suggestedCategory: null });
        expect(nextUncertainRemaining([current, certain, next], 'a')?.transaction.id).toBe('c');
        expect(nextUncertainRemaining([current, certain, next], 'c')).toBeUndefined();
    });

    it('skips Amazon payees so they do not hit generic llm-suggest', () => {
        const current = item({ id: 'a', confidence: 0.4, suggestedCategory: 'Groceries' });
        const amazon = amazonItem('amz');
        const next = item({ id: 'c', confidence: 0.2, suggestedCategory: null });
        expect(nextUncertainRemaining([current, amazon, next], 'a')?.transaction.id).toBe('c');
    });
});

describe('previousUncertainRemaining', () => {
    it('prefetches the previous remaining uncertain item only', () => {
        const previous = item({ id: 'a', confidence: 0.2, suggestedCategory: null });
        const certain = item({ id: 'b', confidence: 1, suggestedCategory: 'Dining' });
        const current = item({ id: 'c', confidence: 0.4, suggestedCategory: 'Groceries' });
        expect(previousUncertainRemaining([previous, certain, current], 'c')?.transaction.id).toBe('a');
        expect(previousUncertainRemaining([previous, certain, current], 'a')).toBeUndefined();
    });
});

describe('selectLlmPrefetchNeighbors', () => {
    it('returns uncertain neighbors above and below the focus', () => {
        const previous = item({ id: 'a', confidence: 0.2, suggestedCategory: null });
        const certain = item({ id: 'b', confidence: 1, suggestedCategory: 'Dining' });
        const current = item({ id: 'c', confidence: 0.4, suggestedCategory: 'Groceries' });
        const next = item({ id: 'd', confidence: 0.3, suggestedCategory: 'Gas' });
        expect(selectLlmPrefetchNeighbors([previous, certain, current, next], 'c')).toEqual({
            previous,
            next,
        });
    });
});

describe('selectAmazonPrefetchNeighbors', () => {
    it('returns Amazon neighbors above and below the focus', () => {
        const previous = amazonItem('a');
        const grocery = item({ id: 'b', confidence: 0.4, suggestedCategory: 'Groceries' });
        const current = amazonItem('c');
        const next = amazonItem('d');
        expect(selectAmazonPrefetchNeighbors([previous, grocery, current, next], 'c')).toEqual({
            previous,
            next,
        });
    });
});

describe('applyLlmOverlay', () => {
    it('does not overwrite a locally certain proposal', () => {
        const certain = item({ confidence: 1, suggestedCategory: 'Groceries', suggestedCategoryId: 'cat-1' });
        const merged = applyLlmOverlay(certain, overlay({ suggestedCategory: 'Dining Out' }));
        expect(merged).toBe(certain);
    });

    it('drops an unresolved category and keeps the local suggestion', () => {
        const local = item({
            confidence: 0.4,
            suggestedCategory: 'Groceries',
            suggestedCategoryId: 'cat-1',
            method: 'CategoryModel',
        });
        const merged = applyLlmOverlay(local, overlay({ suggestedCategory: null, notes: 'unknown name' }));
        expect(scored(merged).suggestedCategory).toBe('Groceries');
        expect(scored(merged).method).toBe('CategoryModel');
        expect(scored(merged).notes).toBe('unknown name');
    });

    it('overlays category as LLM and never promotes to AutoApply', () => {
        const local = item({
            confidence: 0.55,
            suggestedCategory: 'Groceries',
            suggestedCategoryId: 'cat-1',
            tier: 'AutoApply',
            method: 'CategoryModel',
            signals: [{ method: 'CategoryModel', category: 'Groceries', confidence: 0.55 }],
        });
        const merged = applyLlmOverlay(
            local,
            overlay({
                suggestedCategory: 'Dining Out',
                suggestedCategoryGroup: 'Wants',
                suggestedCategoryId: 'cat-9',
                confidence: 0.71,
            }),
        );
        expect(scored(merged).suggestedCategory).toBe('Dining Out');
        expect(scored(merged).method).toBe('LlmCategorization');
        expect(scored(merged).gapReason).toBe('LlmSuggestion');
        expect(scored(merged).tier).toBe('Suggested');
        expect(scored(merged).options.map((option) => option.category)).toEqual(['Dining Out', 'Groceries']);
        expect(scored(merged).signals).toEqual([
            { method: 'CategoryModel', category: 'Groceries', confidence: 0.55 },
            { method: 'LlmCategorization', category: 'Dining Out', confidence: 0.71 },
        ]);
    });

    it('puts an LLM alternate ahead of leftover local options', () => {
        const local = item({
            confidence: 0.4,
            suggestedCategory: 'Groceries',
            suggestedCategoryId: 'cat-1',
        });
        const merged = applyLlmOverlay(
            local,
            overlay({
                suggestedCategory: 'Vacation - Outing',
                suggestedCategoryGroup: 'Vacation',
                suggestedCategoryId: 'vac-outing',
                confidence: 0.8,
                options: [
                    {
                        rank: 1,
                        category: 'Vacation - Outing',
                        categoryGroup: 'Vacation',
                        categoryId: 'vac-outing',
                        confidence: 0.8,
                        supportingMethods: [
                            { method: 'LlmCategorization', category: 'Vacation - Outing', confidence: 0.8 },
                        ],
                    },
                    {
                        rank: 2,
                        category: 'Outing / Theater',
                        categoryGroup: 'Fun',
                        categoryId: 'outing',
                        confidence: 0.8,
                        supportingMethods: [
                            { method: 'LlmCategorization', category: 'Outing / Theater', confidence: 0.8 },
                        ],
                    },
                ],
            }),
        );
        expect(scored(merged).suggestedCategory).toBe('Vacation - Outing');
        expect(scored(merged).options.map((option) => option.category)).toEqual([
            'Vacation - Outing',
            'Outing / Theater',
            'Groceries',
        ]);
    });

    it('attaches an LLM payee overlay without replacing a local rename', () => {
        const localRename = {
            name: 'Local Payee',
            method: 'Model' as const,
            confidence: 0.9,
            needsRename: true,
        };
        const withLocal = item({
            confidence: 0.3,
            suggestedCategory: null,
            payeeSuggestion: localRename,
        });
        expect(scored(applyLlmOverlay(withLocal, overlay({ payeeSuggestion: null }))).payeeSuggestion).toEqual(
            localRename,
        );

        const dirty = item({ confidence: 0.3, suggestedCategory: null, payeeSuggestion: null });
        const llmPayee = {
            name: 'Netflix',
            method: 'Llm' as const,
            confidence: 0.8,
            needsRename: true,
        };
        expect(scored(applyLlmOverlay(dirty, overlay({ payeeSuggestion: llmPayee }))).payeeSuggestion).toEqual(
            llmPayee,
        );
    });

    it('leaves an unscored item unchanged', () => {
        const pending = unscored('tx-1');
        expect(applyLlmOverlay(pending, overlay({ suggestedCategory: 'Dining Out' }))).toBe(pending);
    });
});

function overlay(overrides: Partial<LlmSuggestOverlayDto>): LlmSuggestOverlayDto {
    return {
        transactionId: 'tx-1',
        model: 'qwen/qwen3.7-flash',
        suggestedCategory: null,
        suggestedCategoryGroup: null,
        suggestedCategoryId: null,
        confidence: 0,
        notes: null,
        payeeSuggestion: null,
        options: [],
        ...overrides,
    };
}

function item(overrides: {
    id?: string;
    confidence: number;
    suggestedCategory: string | null;
    suggestedCategoryId?: string | null;
    tier?: CategorizationProposalDto['tier'];
    method?: CategorizationProposalDto['method'];
    signals?: CategorizationProposalDto['signals'];
    payeeSuggestion?: CategorizationProposalDto['payeeSuggestion'];
}): CategorizationQueueItemDto {
    const id = overrides.id ?? 'tx-1';
    return {
        transaction: {
            id,
            date: '2026-01-15',
            amount: -1000,
            memo: null,
            cleared: 'cleared',
            approved: false,
            accountId: 'acct-1',
            accountName: 'Checking',
            payeeId: null,
            payeeName: 'Store',
            categoryId: null,
            categoryName: null,
            importId: null,
            importPayeeName: null,
            importPayeeNameOriginal: null,
        },
        proposal: {
            transactionId: id,
            tier: overrides.tier ?? (overrides.suggestedCategory ? 'Suggested' : 'Blocked'),
            flags: {
                isAmbiguous: false,
                isNovelImport: false,
                isExcluded: false,
                requiresManualReview: !overrides.suggestedCategory,
                isPeriodic: false,
                isPeriodicConflict: false,
                isTravelWindow: false,
            },
            suggestedCategory: overrides.suggestedCategory,
            suggestedCategoryGroup: overrides.suggestedCategory ? 'Needs' : null,
            suggestedCategoryId: overrides.suggestedCategoryId ?? (overrides.suggestedCategory ? 'cat-1' : null),
            confidence: overrides.confidence,
            method: overrides.method ?? (overrides.suggestedCategory ? 'Consensus' : 'Excluded'),
            routeReason: 'None',
            gapReason: 'None',
            signals: overrides.signals ?? [],
            agreeingSignals: [],
            options: overrides.suggestedCategory
                ? [
                      {
                          rank: 1,
                          category: overrides.suggestedCategory,
                          categoryGroup: 'Needs',
                          categoryId: overrides.suggestedCategoryId ?? 'cat-1',
                          confidence: overrides.confidence,
                          supportingMethods: [],
                      },
                  ]
                : [],
            confidenceInterval: { top: overrides.confidence, second: null, third: null, spread: 0 },
            featureText: '',
            resolvedPayee: null,
            payeeSuggestion: overrides.payeeSuggestion ?? null,
            notes: null,
            periodicMatch: null,
            travelWindow: null,
        },
        relatedTransactions: [],
    };
}

function amazonItem(id: string): CategorizationQueueItemDto {
    const scored = item({ id, confidence: 0, suggestedCategory: null });
    return {
        ...scored,
        transaction: {
            ...scored.transaction,
            payeeName: 'Amazon',
            importPayeeNameOriginal: 'AMZN MKTP',
        },
    };
}

function unscored(id: string): CategorizationQueueItemDto {
    const scoredItem = item({ id, confidence: 0, suggestedCategory: null });
    return { ...scoredItem, proposal: null };
}

function scored(entry: CategorizationQueueItemDto): CategorizationProposalDto {
    expect(entry.proposal).not.toBeNull();
    if (!entry.proposal) {
        throw new Error('expected a scored proposal');
    }
    return entry.proposal;
}
