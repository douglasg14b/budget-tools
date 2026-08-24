import { describe, expect, it } from 'vitest';

import { formatUsd, parseOpenRouterUsage } from '../llm/openRouterClient';

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
