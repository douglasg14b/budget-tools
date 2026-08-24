import { describe, expect, it } from 'vitest';

import type { CategorizationProposalDto } from '../../categorizationDtos';
import { selectScoringBatch } from '../selectScoringBatch';
import type { CachedProposalEntry } from '../types';

describe('selectScoringBatch', () => {
    const pendingIds = ['a', 'b', 'c', 'd', 'e'];
    const fingerprints = new Map(pendingIds.map((id) => [id, `fp-${id}`]));

    it('scores the first batch when the cache is empty', () => {
        const result = selectScoringBatch({
            pendingIds,
            fingerprints,
            cacheEntries: new Map(),
            cacheUsable: true,
            batchSize: 2,
            refresh: false,
        });

        expect(result.kept).toEqual([]);
        expect(result.idsToScore).toEqual(['a', 'b']);
    });

    it('does not spawn when the working set is already full', () => {
        const cacheEntries = new Map([
            ['a', cached('a')],
            ['b', cached('b')],
        ]);

        const result = selectScoringBatch({
            pendingIds,
            fingerprints,
            cacheEntries,
            cacheUsable: true,
            batchSize: 2,
            refresh: false,
        });

        expect(result.kept.map((entry) => entry.proposal.transactionId)).toEqual(['a', 'b']);
        expect(result.idsToScore).toEqual([]);
    });

    it('drops fingerprint mismatches and scores a full replacement batch', () => {
        const cacheEntries = new Map([['a', cached('a', 'stale')]]);

        const result = selectScoringBatch({
            pendingIds,
            fingerprints,
            cacheEntries,
            cacheUsable: true,
            batchSize: 2,
            refresh: false,
        });

        expect(result.kept).toEqual([]);
        expect(result.idsToScore).toEqual(['a', 'b', 'c']);
    });

    it('ignores cache entries for transactions that are no longer pending', () => {
        const cacheEntries = new Map([
            ['gone', cached('gone')],
            ['a', cached('a')],
        ]);

        const result = selectScoringBatch({
            pendingIds: ['a', 'b'],
            fingerprints: new Map([
                ['a', 'fp-a'],
                ['b', 'fp-b'],
            ]),
            cacheEntries,
            cacheUsable: true,
            batchSize: 2,
            refresh: false,
        });

        expect(result.kept.map((entry) => entry.proposal.transactionId)).toEqual(['a']);
        expect(result.idsToScore).toEqual(['b']);
    });

    it('scores a full new batch when topping up below batch size', () => {
        const cacheEntries = new Map([['a', cached('a')]]);

        const result = selectScoringBatch({
            pendingIds,
            fingerprints,
            cacheEntries,
            cacheUsable: true,
            batchSize: 2,
            refresh: false,
        });

        expect(result.kept.map((entry) => entry.proposal.transactionId)).toEqual(['a']);
        expect(result.idsToScore).toEqual(['b', 'c']);
    });

    it('discards cache and rescores the newest batch on refresh', () => {
        const cacheEntries = new Map([
            ['a', cached('a')],
            ['b', cached('b')],
        ]);

        const result = selectScoringBatch({
            pendingIds,
            fingerprints,
            cacheEntries,
            cacheUsable: true,
            batchSize: 2,
            refresh: true,
        });

        expect(result.kept).toEqual([]);
        expect(result.idsToScore).toEqual(['a', 'b']);
    });

    it('rescores a stale working-set item without pulling a new batch', () => {
        const cacheEntries = new Map([
            ['a', cached('a')],
            ['b', cached('b', 'stale')],
        ]);

        const result = selectScoringBatch({
            pendingIds,
            fingerprints,
            cacheEntries,
            cacheUsable: true,
            batchSize: 2,
            refresh: false,
        });

        expect(result.kept.map((entry) => entry.proposal.transactionId)).toEqual(['a']);
        expect(result.idsToScore).toEqual(['b']);
    });

    it('expand scores the next never-scored batch when the working set is already full', () => {
        const cacheEntries = new Map([
            ['a', cached('a')],
            ['b', cached('b')],
        ]);

        const result = selectScoringBatch({
            pendingIds,
            fingerprints,
            cacheEntries,
            cacheUsable: true,
            batchSize: 2,
            refresh: false,
            expand: true,
        });

        expect(result.kept.map((entry) => entry.proposal.transactionId)).toEqual(['a', 'b']);
        expect(result.idsToScore).toEqual(['c', 'd']);
    });

    it('expand rescores stale ids and still pulls the next never-scored batch', () => {
        const cacheEntries = new Map([
            ['a', cached('a')],
            ['b', cached('b', 'stale')],
        ]);

        const result = selectScoringBatch({
            pendingIds,
            fingerprints,
            cacheEntries,
            cacheUsable: true,
            batchSize: 2,
            refresh: false,
            expand: true,
        });

        expect(result.kept.map((entry) => entry.proposal.transactionId)).toEqual(['a']);
        expect(result.idsToScore).toEqual(['b', 'c', 'd']);
    });

    it('refresh ignores expand and rescores only the newest batch', () => {
        const cacheEntries = new Map([
            ['a', cached('a')],
            ['b', cached('b')],
        ]);

        const result = selectScoringBatch({
            pendingIds,
            fingerprints,
            cacheEntries,
            cacheUsable: true,
            batchSize: 2,
            refresh: true,
            expand: true,
        });

        expect(result.kept).toEqual([]);
        expect(result.idsToScore).toEqual(['a', 'b']);
    });

    it('treats an unusable cache as empty', () => {
        const result = selectScoringBatch({
            pendingIds,
            fingerprints,
            cacheEntries: new Map([['a', cached('a')]]),
            cacheUsable: false,
            batchSize: 2,
            refresh: false,
        });

        expect(result.kept).toEqual([]);
        expect(result.idsToScore).toEqual(['a', 'b']);
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
