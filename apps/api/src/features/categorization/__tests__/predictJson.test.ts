import { existsSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', () => ({
    existsSync: vi.fn(() => true),
}));

import { parsePredictJsonEnvelope } from '../parsePredictJson';
import { assertCategorizationModelsExist, runPredictJson } from '../predictJson';

const existsSyncMock = vi.mocked(existsSync);

const validEnvelope = {
    summary: {
        total: 1,
        autoApply: 1,
        suggested: 0,
        review: 0,
        blocked: 0,
    },
    proposals: [
        {
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
            signals: [],
            agreeingSignals: [],
            options: [],
            confidenceInterval: { top: 1, second: null, third: null, spread: 0 },
            featureText: 'STORE',
            resolvedPayee: null,
            payeeSuggestion: null,
            notes: null,
            periodicMatch: null,
            travelWindow: null,
        },
    ],
};

const baseInput = {
    workingDir: 'apps/categorization-ai',
    modelsDir: 'models',
    connectionString: 'postgres://example',
    sqliteDbPath: 'apps/api/data/app.sqlite',
    timeoutMs: 5000,
    llm: false,
    transactionIds: ['tx-1'],
} as const;

describe('runPredictJson warm scorer', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        delete process.env.CATEGORIZATION_SCORER_URL;
    });

    it('posts to the warm scorer when CATEGORIZATION_SCORER_URL is set', async () => {
        process.env.CATEGORIZATION_SCORER_URL = 'http://127.0.0.1:4021';

        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            text: async () => JSON.stringify(validEnvelope),
        });
        vi.stubGlobal('fetch', fetchMock);

        const result = await runPredictJson(baseInput);

        expect(fetchMock).toHaveBeenCalledWith(
            'http://127.0.0.1:4021/predict',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ transactionIds: ['tx-1'], llm: false }),
            }),
        );
        expect(result).toEqual(parsePredictJsonEnvelope(validEnvelope));
    });

    it('surfaces warm scorer HTTP failures', async () => {
        process.env.CATEGORIZATION_SCORER_URL = 'http://127.0.0.1:4021';

        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: false,
                status: 500,
                text: async () => 'boom',
            }),
        );

        await expect(runPredictJson(baseInput)).rejects.toThrow('warm scorer POST /predict failed (500): boom');
    });
});

describe('assertCategorizationModelsExist', () => {
    beforeEach(() => {
        existsSyncMock.mockClear();
    });

    afterEach(() => {
        existsSyncMock.mockReturnValue(true);
        vi.unstubAllGlobals();
        delete process.env.CATEGORIZATION_SCORER_URL;
    });

    it('fails loud when a model file is missing and this process would spawn the scorer', () => {
        existsSyncMock.mockReturnValue(false);

        expect(() => assertCategorizationModelsExist('models')).toThrow(/Missing model file at/);
    });

    it('skips the check when scoring is delegated to the warm scorer', () => {
        // The scorer container owns the model files; requiring them in the API container too
        // would block an otherwise healthy deployment.
        existsSyncMock.mockReturnValue(false);
        process.env.CATEGORIZATION_SCORER_URL = 'http://scorer:4021';

        expect(() => assertCategorizationModelsExist('models')).not.toThrow();
        expect(existsSyncMock).not.toHaveBeenCalled();
    });

    it('scores via the warm scorer even when no model files are present locally', async () => {
        existsSyncMock.mockReturnValue(false);
        process.env.CATEGORIZATION_SCORER_URL = 'http://scorer:4021';
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify(validEnvelope) }),
        );

        await expect(runPredictJson(baseInput)).resolves.toEqual(parsePredictJsonEnvelope(validEnvelope));
    });
});
