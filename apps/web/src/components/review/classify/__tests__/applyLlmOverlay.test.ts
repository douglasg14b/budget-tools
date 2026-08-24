import type {
    CategorizationProposalDto,
    CategorizationQueueItemDto,
    LlmSuggestOverlayDto,
} from '@budget-tools/web-sdk';
import { describe, expect, it } from 'vitest';

import { applyLlmOverlay, needsLlmSuggest, nextUncertainRemaining } from '../applyLlmOverlay';

describe('needsLlmSuggest', () => {
    it('skips decided items and locally certain proposals', () => {
        expect(needsLlmSuggest(item({ confidence: 0.4, suggestedCategory: 'Groceries' }), true)).toBe(false);
        expect(needsLlmSuggest(item({ confidence: 1, suggestedCategory: 'Groceries' }), false)).toBe(false);
        expect(needsLlmSuggest(item({ confidence: 0.4, suggestedCategory: 'Groceries' }), false)).toBe(true);
        expect(needsLlmSuggest(item({ confidence: 1, suggestedCategory: null }), false)).toBe(true);
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
        expect(merged.proposal.suggestedCategory).toBe('Groceries');
        expect(merged.proposal.method).toBe('CategoryModel');
        expect(merged.proposal.notes).toBe('unknown name');
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
        expect(merged.proposal.suggestedCategory).toBe('Dining Out');
        expect(merged.proposal.method).toBe('LlmCategorization');
        expect(merged.proposal.gapReason).toBe('LlmSuggestion');
        expect(merged.proposal.tier).toBe('Suggested');
        expect(merged.proposal.options).toEqual(local.proposal.options);
        expect(merged.proposal.signals).toEqual([
            { method: 'CategoryModel', category: 'Groceries', confidence: 0.55 },
            { method: 'LlmCategorization', category: 'Dining Out', confidence: 0.71 },
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
        expect(applyLlmOverlay(withLocal, overlay({ payeeSuggestion: null })).proposal.payeeSuggestion).toEqual(
            localRename,
        );

        const dirty = item({ confidence: 0.3, suggestedCategory: null, payeeSuggestion: null });
        const llmPayee = {
            name: 'Netflix',
            method: 'Llm' as const,
            confidence: 0.8,
            needsRename: true,
        };
        expect(applyLlmOverlay(dirty, overlay({ payeeSuggestion: llmPayee })).proposal.payeeSuggestion).toEqual(
            llmPayee,
        );
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
