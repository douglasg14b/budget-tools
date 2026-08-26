import { describe, expect, it } from 'vitest';

import { HttpError, NotFoundError } from '../../travelWindows/HttpError';
import type { CachedProposalEntry } from '../cache/types';
import type { CategorizationProposalDto } from '../categorizationDtos';
import {
    assertAllPending,
    PREDICT_MAX_IDS,
    parsePredictRequest,
    selectPredictIdsToScore,
} from '../predictTransactions';

describe('parsePredictRequest', () => {
    it('rejects an empty list', () => {
        expect(() => parsePredictRequest([])).toThrow(HttpError);
        expect(() => parsePredictRequest(undefined)).toThrow(HttpError);
    });

    it('rejects more than the cap', () => {
        const ids = Array.from({ length: PREDICT_MAX_IDS + 1 }, (_value, index) => `id-${index}`);
        expect(() => parsePredictRequest(ids)).toThrow(/cannot exceed/);
    });

    it('dedupes while preserving first-seen order', () => {
        expect(parsePredictRequest(['b', 'a', 'b', 'c'])).toEqual(['b', 'a', 'c']);
    });
});

describe('assertAllPending', () => {
    it('throws when any requested id is not pending', () => {
        expect(() => assertAllPending(['a', 'gone'], new Set(['a']))).toThrow(NotFoundError);
    });

    it('accepts ids that are all pending', () => {
        expect(() => assertAllPending(['a', 'b'], new Set(['a', 'b', 'c']))).not.toThrow();
    });
});

describe('selectPredictIdsToScore', () => {
    it('scores only requested ids that are not already kept', () => {
        expect(selectPredictIdsToScore(['a', 'b', 'c'], [cached('a'), cached('c')])).toEqual(['b']);
    });

    it('scores nothing when every requested id is cached', () => {
        expect(selectPredictIdsToScore(['a'], [cached('a')])).toEqual([]);
    });
});

function cached(transactionId: string): CachedProposalEntry {
    return {
        fingerprint: `fp-${transactionId}`,
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
