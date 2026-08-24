import { describe, expect, it } from 'vitest';

import { extractJsonObject, PredictJsonError, parsePredictJsonStdout } from '../parsePredictJson';

const validProposal = {
    transactionId: 'tx-1',
    tier: 'AutoApply',
    flags: {
        isAmbiguous: false,
        isNovelImport: false,
        isExcluded: false,
        requiresManualReview: false,
        isPeriodic: false,
        isPeriodicConflict: false,
    },
    suggestedCategory: 'Groceries',
    suggestedCategoryGroup: 'Needs',
    suggestedCategoryId: 'cat-1',
    confidence: 1,
    method: 'Consensus',
    routeReason: 'None',
    gapReason: 'None',
    signals: [{ method: 'ImportAmountLookup', category: 'Groceries', confidence: 1 }],
    agreeingSignals: [{ method: 'ImportAmountLookup', category: 'Groceries', confidence: 1 }],
    options: [
        {
            rank: 1,
            category: 'Groceries',
            categoryGroup: 'Needs',
            categoryId: 'cat-1',
            confidence: 1,
            supportingMethods: [{ method: 'ImportAmountLookup', category: 'Groceries', confidence: 1 }],
        },
    ],
    confidenceInterval: { top: 1, second: null, third: null, spread: 0 },
    featureText: 'GROCERIES STORE',
    resolvedPayee: 'Store',
    payeeSuggestion: null,
    notes: 'Consensus',
    periodicMatch: null,
};

const validEnvelope = {
    summary: { total: 1, autoApply: 1, suggested: 0, review: 0, blocked: 0 },
    proposals: [validProposal],
};

describe('extractJsonObject', () => {
    it('returns JSON-only stdout unchanged', () => {
        const json = JSON.stringify(validEnvelope);
        expect(extractJsonObject(json)).toBe(json);
    });

    it('strips leading CLI banners before the JSON object', () => {
        const json = JSON.stringify(validEnvelope);
        expect(extractJsonObject(`Building...\n${json}`)).toBe(json);
    });

    it('throws when stdout has no JSON object', () => {
        expect(() => extractJsonObject('no json here')).toThrow(PredictJsonError);
    });

    it('throws when the JSON object is truncated', () => {
        expect(() => extractJsonObject('prefix { "summary": ')).toThrow(PredictJsonError);
    });
});

describe('parsePredictJsonStdout', () => {
    it('parses a valid envelope', () => {
        const parsed = parsePredictJsonStdout(JSON.stringify(validEnvelope));
        expect(parsed.summary.total).toBe(1);
        expect(parsed.proposals).toHaveLength(1);
        expect(parsed.proposals[0]?.transactionId).toBe('tx-1');
        expect(parsed.proposals[0]?.options[0]?.category).toBe('Groceries');
    });

    it('parses JSON that follows training logs', () => {
        const parsed = parsePredictJsonStdout(`Loaded 10 training transactions\n${JSON.stringify(validEnvelope)}`);
        expect(parsed.summary.autoApply).toBe(1);
    });

    it('parses a periodic series match', () => {
        const envelope = {
            ...validEnvelope,
            proposals: [
                {
                    ...validProposal,
                    flags: {
                        ...validProposal.flags,
                        isPeriodic: true,
                    },
                    method: 'PeriodicSeriesLookup',
                    periodicMatch: {
                        cadence: 'Monthly',
                        occurrenceCount: 12,
                        medianAmount: -14990,
                        lastDate: '2024-06-15',
                        category: 'Streaming',
                        categoryVoteShare: 1,
                        relatedTransactionIds: ['tx-a', 'tx-b'],
                        cadenceFit: 1,
                    },
                },
            ],
        };

        const parsed = parsePredictJsonStdout(JSON.stringify(envelope));
        expect(parsed.proposals[0]?.flags.isPeriodic).toBe(true);
        expect(parsed.proposals[0]?.periodicMatch).toEqual({
            cadence: 'Monthly',
            occurrenceCount: 12,
            medianAmount: -14990,
            lastDate: '2024-06-15',
            category: 'Streaming',
            categoryVoteShare: 1,
            relatedTransactionIds: ['tx-a', 'tx-b'],
            cadenceFit: 1,
        });
    });

    it('accepts a periodic series with no usable historical category', () => {
        const envelope = {
            ...validEnvelope,
            proposals: [
                {
                    ...validProposal,
                    flags: {
                        ...validProposal.flags,
                        isPeriodic: true,
                    },
                    periodicMatch: {
                        cadence: 'Monthly',
                        occurrenceCount: 5,
                        medianAmount: -14990,
                        lastDate: '2026-07-17',
                        category: '',
                        categoryVoteShare: 0,
                        relatedTransactionIds: ['tx-a'],
                        cadenceFit: 1,
                    },
                },
            ],
        };

        const parsed = parsePredictJsonStdout(JSON.stringify(envelope));
        expect(parsed.proposals[0]?.periodicMatch).toMatchObject({
            category: null,
            categoryVoteShare: 0,
        });
    });

    it('parses a payee rename suggestion', () => {
        const envelope = {
            ...validEnvelope,
            proposals: [
                {
                    ...validProposal,
                    payeeSuggestion: {
                        name: 'Stumptown',
                        method: 'ExactLookup',
                        confidence: 1,
                        needsRename: true,
                    },
                },
            ],
        };

        const parsed = parsePredictJsonStdout(JSON.stringify(envelope));
        expect(parsed.proposals[0]?.payeeSuggestion).toEqual({
            name: 'Stumptown',
            method: 'ExactLookup',
            confidence: 1,
            needsRename: true,
        });
    });

    it('defaults a missing payee suggestion to null', () => {
        const { payeeSuggestion: _omitted, ...withoutPayee } = validProposal;
        const parsed = parsePredictJsonStdout(JSON.stringify({ ...validEnvelope, proposals: [withoutPayee] }));
        expect(parsed.proposals[0]?.payeeSuggestion).toBeNull();
    });

    it('throws on empty stdout', () => {
        expect(() => parsePredictJsonStdout('')).toThrow(PredictJsonError);
    });

    it('defaults omitted travel fields so older predict-json output still parses', () => {
        const parsed = parsePredictJsonStdout(JSON.stringify(validEnvelope));
        expect(parsed.proposals[0]?.flags.isTravelWindow).toBe(false);
        expect(parsed.proposals[0]?.travelWindow).toBeNull();
    });

    it('parses a travel window hit', () => {
        const envelope = {
            ...validEnvelope,
            proposals: [
                {
                    ...validProposal,
                    flags: { ...validProposal.flags, isTravelWindow: true },
                    travelWindow: {
                        id: '11111111-1111-1111-1111-111111111111',
                        name: 'Hawaii',
                        kind: 'vacation',
                        targetCategory: 'Vacation - Coffee',
                    },
                },
            ],
        };
        const parsed = parsePredictJsonStdout(JSON.stringify(envelope));
        expect(parsed.proposals[0]?.flags.isTravelWindow).toBe(true);
        expect(parsed.proposals[0]?.travelWindow).toEqual({
            id: '11111111-1111-1111-1111-111111111111',
            name: 'Hawaii',
            kind: 'vacation',
            targetCategory: 'Vacation - Coffee',
        });
    });
});
