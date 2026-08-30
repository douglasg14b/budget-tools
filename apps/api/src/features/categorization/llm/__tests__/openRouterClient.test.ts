import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    completeOpenRouterJson,
    formatUsd,
    openRouterUserContent,
    parseOpenRouterPrediction,
    parseOpenRouterUsage,
} from '../openRouterClient';

describe('parseOpenRouterPrediction', () => {
    it('reads primary and alternate categories', () => {
        expect(
            parseOpenRouterPrediction(
                JSON.stringify({
                    categoryName: 'Vacation - Outing',
                    categoryGroupName: 'Vacation',
                    alternateCategoryName: 'Outing / Theater',
                    alternateCategoryGroupName: 'Fun',
                    confidence: 0.82,
                    rationale: 'Trip outing',
                    payeeName: 'Meow Wolf',
                }),
            ),
        ).toEqual({
            categoryName: 'Vacation - Outing',
            categoryGroupName: 'Vacation',
            alternateCategoryName: 'Outing / Theater',
            alternateCategoryGroupName: 'Fun',
            confidence: 0.82,
            rationale: 'Trip outing',
            payeeName: 'Meow Wolf',
        });
    });

    it('drops an alternate that repeats the primary name', () => {
        expect(
            parseOpenRouterPrediction(
                JSON.stringify({
                    categoryName: 'Coffee',
                    categoryGroupName: 'Everyday',
                    alternateCategoryName: 'Coffee',
                    alternateCategoryGroupName: 'Everyday',
                    confidence: 0.9,
                    rationale: 'Coffee shop',
                    payeeName: null,
                }),
            ).alternateCategoryName,
        ).toBeNull();
    });
});

describe('parseOpenRouterUsage', () => {
    it('reads token counts, cached tokens, and USD cost', () => {
        expect(
            parseOpenRouterUsage({
                prompt_tokens: 1842,
                completion_tokens: 64,
                total_tokens: 1906,
                cost: 0.0000412,
                prompt_tokens_details: { cached_tokens: 12 },
            }),
        ).toEqual({
            promptTokens: 1842,
            completionTokens: 64,
            totalTokens: 1906,
            cachedTokens: 12,
            costUsd: 0.0000412,
        });
    });

    it('sums prompt and completion when total_tokens is missing', () => {
        expect(
            parseOpenRouterUsage({
                prompt_tokens: 10,
                completion_tokens: 5,
            }),
        ).toEqual({
            promptTokens: 10,
            completionTokens: 5,
            totalTokens: 15,
            cachedTokens: null,
            costUsd: null,
        });
    });

    it('returns null when usage is missing or empty', () => {
        expect(parseOpenRouterUsage(undefined)).toBeNull();
        expect(parseOpenRouterUsage({})).toBeNull();
    });
});

describe('formatUsd', () => {
    it('formats sub-cent inference costs with six decimals', () => {
        expect(formatUsd(0.0000412)).toBe('$0.000041');
    });

    it('formats zero and missing costs', () => {
        expect(formatUsd(0)).toBe('$0');
        expect(formatUsd(null)).toBeNull();
    });
});

describe('openRouterUserContent', () => {
    it('keeps string user content when images are omitted', () => {
        expect(openRouterUserContent('read this receipt')).toBe('read this receipt');
        expect(openRouterUserContent('read this receipt', [])).toBe('read this receipt');
    });

    it('builds a text plus image_url content array for vision', () => {
        const dataUrl = 'data:image/jpeg;base64,AAAA';
        expect(openRouterUserContent('extract headers', [dataUrl])).toEqual([
            { type: 'text', text: 'extract headers' },
            { type: 'image_url', image_url: { url: dataUrl } },
        ]);
    });
});

describe('completeOpenRouterJson vision payload', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('posts image_url data URLs when images are provided', async () => {
        const dataUrl = 'data:image/jpeg;base64,AAAA';
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                id: 'gen-1',
                model: 'qwen/qwen3.7-flash',
                choices: [{ message: { content: '{"vendor":"Cafe"}' } }],
                usage: { prompt_tokens: 10, completion_tokens: 4, cost: 0.0001 },
            }),
        });
        vi.stubGlobal('fetch', fetchMock);

        await completeOpenRouterJson({
            apiKey: 'test-key',
            baseUrl: 'https://openrouter.example/api/v1',
            model: 'qwen/qwen3.7-flash',
            system: 'system',
            user: 'extract headers',
            timeoutMs: 5_000,
            schemaName: 'receipt_headers',
            schema: { type: 'object' },
            images: [dataUrl],
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
        const body = JSON.parse(init.body) as {
            messages: Array<{ role: string; content: unknown }>;
        };
        expect(body.messages[1]?.content).toEqual([
            { type: 'text', text: 'extract headers' },
            { type: 'image_url', image_url: { url: dataUrl } },
        ]);
    });

    it('posts string user content when images are omitted', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: '{"ok":true}' } }],
                usage: { prompt_tokens: 1, completion_tokens: 1 },
            }),
        });
        vi.stubGlobal('fetch', fetchMock);

        await completeOpenRouterJson({
            apiKey: 'test-key',
            baseUrl: 'https://openrouter.example/api/v1',
            model: 'qwen/qwen3.7-flash',
            system: 'system',
            user: 'hello',
            timeoutMs: 5_000,
            schemaName: 'category_prediction',
            schema: { type: 'object' },
        });

        const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
        const body = JSON.parse(init.body) as {
            messages: Array<{ role: string; content: unknown }>;
        };
        expect(body.messages[1]?.content).toBe('hello');
    });
});
