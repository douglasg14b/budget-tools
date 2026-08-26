import { describe, expect, it } from 'vitest';
import type { CategorizationProposalDto } from '../categorizationDtos';
import { joinQueueItems } from '../joinQueueItems';
import type { PendingTransactionRow } from '../listPendingTransactions';

describe('joinQueueItems', () => {
    const pending = [row('a'), row('b'), row('c')];
    const proposalsById = new Map([
        ['a', proposal('a')],
        ['c', proposal('c')],
    ]);

    it('includes pending rows without a proposal when requireProposal is false', () => {
        const items = joinQueueItems({
            pending,
            proposalsById,
            sliceIds: new Set(['a', 'b', 'c']),
            requireProposal: false,
        });
        expect(items.map((item) => [item.transaction.id, item.proposal?.transactionId ?? null])).toEqual([
            ['a', 'a'],
            ['b', null],
            ['c', 'c'],
        ]);
    });

    it('omits pending rows without a proposal when requireProposal is true', () => {
        const items = joinQueueItems({
            pending,
            proposalsById,
            requireProposal: true,
        });
        expect(items.map((item) => item.transaction.id)).toEqual(['a', 'c']);
    });

    it('limits to slice ids without scoring the rest', () => {
        const items = joinQueueItems({
            pending,
            proposalsById,
            sliceIds: new Set(['b']),
            requireProposal: false,
        });
        expect(items).toHaveLength(1);
        expect(items[0]?.transaction.id).toBe('b');
        expect(items[0]?.proposal).toBeNull();
    });
});

function row(id: string): PendingTransactionRow {
    return {
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
        fingerprint: `fp-${id}`,
    };
}

function proposal(transactionId: string): CategorizationProposalDto {
    return {
        transactionId,
        tier: 'Review',
        flags: {
            isAmbiguous: false,
            isNovelImport: false,
            isExcluded: false,
            requiresManualReview: false,
            isPeriodic: false,
            isPeriodicConflict: false,
            isTravelWindow: false,
        },
        suggestedCategory: 'Groceries',
        suggestedCategoryGroup: 'Needs',
        suggestedCategoryId: 'cat-1',
        confidence: 0.5,
        method: 'Consensus',
        routeReason: 'None',
        gapReason: 'None',
        signals: [],
        agreeingSignals: [],
        options: [],
        confidenceInterval: { top: 0.5, second: null, third: null, spread: 0 },
        featureText: '',
        resolvedPayee: null,
        payeeSuggestion: null,
        notes: null,
        periodicMatch: null,
        travelWindow: null,
    };
}
