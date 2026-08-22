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
    notes: 'Consensus',
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

    it('throws on empty stdout', () => {
        expect(() => parsePredictJsonStdout('')).toThrow(PredictJsonError);
    });

    it('throws when proposals is not an array', () => {
        expect(() => parsePredictJsonStdout(JSON.stringify({ summary: validEnvelope.summary, proposals: {} }))).toThrow(
            PredictJsonError,
        );
    });
});
