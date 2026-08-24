import { describe, expect, it } from 'vitest';

import type { CategorizationProposalDto } from '../../categorizationDtos';
import { selectWindowScoring, selectWindowSlice } from '../selectWindowSlice';
import type { CachedProposalEntry } from '../types';

describe('selectWindowSlice', () => {
    const pendingIds = ['n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8', 'n9'];

    it('centers a window on around and clamps at the newest end', () => {
        expect(selectWindowSlice({ pendingIds, batchSize: 5, around: 'n0' })).toEqual({
            ids: ['n0', 'n1', 'n2', 'n3', 'n4'],
            startIndex: 0,
            endIndexExclusive: 5,
        });
    });

    it('centers a window in the middle', () => {
        expect(selectWindowSlice({ pendingIds, batchSize: 5, around: 'n5' })).toEqual({
            ids: ['n3', 'n4', 'n5', 'n6', 'n7'],
            startIndex: 3,
            endIndexExclusive: 8,
        });
    });

    it('clamps at the oldest end', () => {
        expect(selectWindowSlice({ pendingIds, batchSize: 5, around: 'n9' })).toEqual({
            ids: ['n5', 'n6', 'n7', 'n8', 'n9'],
            startIndex: 5,
            endIndexExclusive: 10,
        });
    });

    it('falls back to the newest window when around is missing', () => {
        expect(selectWindowSlice({ pendingIds, batchSize: 4, around: 'gone' })).toEqual({
            ids: ['n0', 'n1', 'n2', 'n3'],
            startIndex: 0,
            endIndexExclusive: 4,
        });
    });

    it('takes the exclusive older batch after olderThan', () => {
        expect(selectWindowSlice({ pendingIds, batchSize: 3, olderThan: 'n4' })).toEqual({
            ids: ['n5', 'n6', 'n7'],
            startIndex: 5,
            endIndexExclusive: 8,
        });
    });

    it('takes the exclusive newer batch before newerThan', () => {
        expect(selectWindowSlice({ pendingIds, batchSize: 3, newerThan: 'n4' })).toEqual({
            ids: ['n1', 'n2', 'n3'],
            startIndex: 1,
            endIndexExclusive: 4,
        });
    });

    it('prefers olderThan when multiple cursors are set', () => {
        expect(selectWindowSlice({ pendingIds, batchSize: 3, around: 'n2', olderThan: 'n4', newerThan: 'n8' })).toEqual(
            {
                ids: ['n5', 'n6', 'n7'],
                startIndex: 5,
                endIndexExclusive: 8,
            },
        );
    });

    it('returns an empty older slice past the last id', () => {
        expect(selectWindowSlice({ pendingIds, batchSize: 3, olderThan: 'n9' })).toEqual({
            ids: [],
            startIndex: 10,
            endIndexExclusive: 10,
        });
    });
});

describe('selectWindowScoring', () => {
    const pendingIds = ['n0', 'n1', 'n2', 'n3', 'n4', 'n5'];
    const fingerprints = new Map(pendingIds.map((id) => [id, `fp-${id}`]));

    it('keeps newest cached rows when scoring a middle window', () => {
        const cacheEntries = new Map([
            ['n0', cached('n0')],
            ['n1', cached('n1')],
            ['n2', cached('n2')],
        ]);

        const result = selectWindowScoring({
            pendingIds,
            fingerprints,
            cacheEntries,
            cacheUsable: true,
            batchSize: 3,
            around: 'n4',
        });

        expect(result.ids).toEqual(['n3', 'n4', 'n5']);
        expect(result.kept.map((entry) => entry.proposal.transactionId)).toEqual(['n0', 'n1', 'n2']);
        expect(result.idsToScore).toEqual(['n3', 'n4', 'n5']);
    });

    it('does not rescore slice ids that are already valid in cache', () => {
        const cacheEntries = new Map([
            ['n0', cached('n0')],
            ['n3', cached('n3')],
            ['n4', cached('n4')],
        ]);

        const result = selectWindowScoring({
            pendingIds,
            fingerprints,
            cacheEntries,
            cacheUsable: true,
            batchSize: 3,
            around: 'n4',
        });

        expect(result.idsToScore).toEqual(['n5']);
        expect(result.kept.map((entry) => entry.proposal.transactionId)).toEqual(['n0', 'n3', 'n4']);
    });
});

function cached(transactionId: string, fingerprint = `fp-${transactionId}`): CachedProposalEntry {
    return {
        fingerprint,
        generatedAt: '2026-01-01T00:00:00.000Z',
        proposal: proposal(transactionId),
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
