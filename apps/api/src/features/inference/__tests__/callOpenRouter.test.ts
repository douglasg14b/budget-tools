import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppDatabaseClient } from '../../../data-persistence/database';
import { createTestAppDatabase } from '../../../data-persistence/testDatabase';
import { parseOpenRouterUsage } from '../../categorization/llm/openRouterClient';
import { completeDecisions } from '../../receipts/pipeline/decisionsClient';
import { callOpenRouter, OpenRouterCallError } from '../callOpenRouter';
import { setInferenceCallRecorderForTests } from '../recordInferenceCall';

const CHAT_URL = 'https://openrouter.example/api/v1/chat/completions';

function jsonReply(status: number, body: unknown): typeof fetch {
    return vi.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body),
    }) as unknown as typeof fetch;
}

function chatCall(fetchImpl: typeof fetch, timeoutMs = 5_000) {
    return callOpenRouter({
        purpose: 'receipt-header',
        url: CHAT_URL,
        apiKey: 'test-key',
        model: 'qwen/qwen3.7-flash',
        body: { messages: [] },
        timeoutMs,
        fetchImpl,
        parseUsage: (payload) => parseOpenRouterUsage((payload as { usage?: unknown }).usage),
    });
}

describe('callOpenRouter ledger', () => {
    let appDb: Awaited<ReturnType<typeof createTestAppDatabase>>;
    let database: AppDatabaseClient;

    beforeEach(async () => {
        appDb = await createTestAppDatabase();
        database = appDb.db;
    });

    afterEach(async () => {
        await appDb.close();
    });

    async function ledger() {
        return database.selectFrom('inference_calls').selectAll().execute();
    }

    it('records purpose, model, tokens, and cost for a completed call', async () => {
        const fetchImpl = jsonReply(200, {
            id: 'gen-1',
            model: 'qwen/qwen3.7-flash-20260901',
            provider: 'Alibaba',
            choices: [{ message: { content: '{}' } }],
            usage: {
                prompt_tokens: 1200,
                completion_tokens: 80,
                cost: 0.00042,
                prompt_tokens_details: { cached_tokens: 1000 },
                completion_tokens_details: { reasoning_tokens: 30 },
            },
        });

        await chatCall(fetchImpl);

        const init = vi.mocked(fetchImpl).mock.calls[0]?.[1] as { body: string };
        expect(JSON.parse(init.body)).toMatchObject({ model: 'qwen/qwen3.7-flash' });
        const rows = await ledger();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            purpose: 'receipt-header',
            model: 'qwen/qwen3.7-flash',
            responseModel: 'qwen/qwen3.7-flash-20260901',
            provider: 'Alibaba',
            generationId: 'gen-1',
            outcome: 'ok',
            httpStatus: 200,
            promptTokens: 1200,
            completionTokens: 80,
            reasoningTokens: 30,
            cachedTokens: 1000,
            costUsd: 0.00042,
        });
        expect(rows[0]?.calledAt).toBeInstanceOf(Date);
    });

    it('records a rejected call with its status and no usage', async () => {
        await expect(chatCall(jsonReply(402, { error: 'insufficient credits' }))).rejects.toMatchObject({
            outcome: 'http-error',
            status: 402,
        });

        expect(await ledger()).toEqual([
            expect.objectContaining({
                purpose: 'receipt-header',
                outcome: 'http-error',
                httpStatus: 402,
                promptTokens: null,
                costUsd: null,
            }),
        ]);
    });

    it('records a timed-out call, which OpenRouter may still bill', async () => {
        const hangs = ((_url: string, init: { signal: AbortSignal }) =>
            new Promise((_resolve, reject) => {
                init.signal.addEventListener('abort', () =>
                    reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
                );
            })) as unknown as typeof fetch;

        await expect(chatCall(hangs, 10)).rejects.toBeInstanceOf(OpenRouterCallError);

        expect(await ledger()).toEqual([expect.objectContaining({ outcome: 'timeout', httpStatus: null })]);
    });

    it('records Decisions API calls under their own purpose', async () => {
        await completeDecisions({
            purpose: 'receipt-bind-confirm',
            apiKey: 'test-key',
            model: 'qwen/qwen3.7-flash',
            state: 'state',
            questions: {},
            timeoutMs: 5_000,
            fetchImpl: jsonReply(200, { answers: {}, usage: { input_tokens: 500, output_tokens: 0, cost: 0.0001 } }),
        });

        expect(await ledger()).toEqual([
            expect.objectContaining({
                purpose: 'receipt-bind-confirm',
                outcome: 'ok',
                promptTokens: 500,
                completionTokens: 0,
                costUsd: 0.0001,
            }),
        ]);
    });
});

describe('callOpenRouter without a ledger', () => {
    afterEach(() => {
        setInferenceCallRecorderForTests(undefined);
        vi.restoreAllMocks();
    });

    it('returns the completion when recording fails', async () => {
        setInferenceCallRecorderForTests(async () => {
            throw new Error('database down');
        });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const result = await chatCall(
            jsonReply(200, { choices: [{ message: { content: '{}' } }], usage: { prompt_tokens: 1 } }),
        );

        expect(result.usage?.promptTokens).toBe(1);
        expect(warn).toHaveBeenCalledWith('inference call not recorded', expect.anything());
    });
});
