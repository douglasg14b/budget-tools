import { describe, expect, it } from 'vitest';

import {
    assertOpenRouterModelsRegistered,
    openRouterProfileRequestFields,
    resolveOpenRouterModelProfile,
    UnknownOpenRouterModelError,
} from '../openRouterModelProfiles';

describe('resolveOpenRouterModelProfile', () => {
    it('returns the registered profile', () => {
        expect(resolveOpenRouterModelProfile('qwen/qwen3.8-max')).toEqual({
            temperature: 0.1,
            reasoning: { mode: 'effort', effort: 'low' },
        });
        expect(resolveOpenRouterModelProfile('qwen/qwen3.7-flash').reasoning).toEqual({ mode: 'disabled' });
    });

    it('matches regardless of case, whitespace, or a :variant suffix', () => {
        expect(resolveOpenRouterModelProfile(' Qwen/Qwen3.8-Max:nitro ').reasoning).toEqual({
            mode: 'effort',
            effort: 'low',
        });
    });

    it('throws for an unregistered model instead of guessing its options', () => {
        expect(() => resolveOpenRouterModelProfile('vendor/unknown-model')).toThrow(UnknownOpenRouterModelError);
        expect(() => resolveOpenRouterModelProfile('vendor/unknown-model')).toThrow(
            /"vendor\/unknown-model" has no profile.*MODEL_PROFILES/,
        );
    });
});

describe('assertOpenRouterModelsRegistered', () => {
    it('accepts the default configured models', () => {
        expect(() =>
            assertOpenRouterModelsRegistered({
                OPENROUTER_MODEL: 'qwen/qwen3.7-flash',
                OPENROUTER_RECEIPT_REPAIR_MODEL: 'qwen/qwen3.7-plus',
                OPENROUTER_RECEIPT_RETRY_MODEL: 'qwen/qwen3.8-max',
            }),
        ).not.toThrow();
    });

    it('names the setting that holds the unregistered model', () => {
        expect(() =>
            assertOpenRouterModelsRegistered({
                OPENROUTER_MODEL: 'qwen/qwen3.7-flash',
                OPENROUTER_RECEIPT_RETRY_MODEL: 'vendor/new-frontier',
            }),
        ).toThrow(/"vendor\/new-frontier" \(from OPENROUTER_RECEIPT_RETRY_MODEL\) has no profile/);
    });
});

describe('openRouterProfileRequestFields', () => {
    it('maps reasoning policies to OpenRouter request fields', () => {
        expect(
            openRouterProfileRequestFields({ temperature: 0.2, reasoning: { mode: 'effort', effort: 'high' } }),
        ).toEqual({ temperature: 0.2, reasoning: { effort: 'high' } });
        expect(openRouterProfileRequestFields({ temperature: 0.1, reasoning: { mode: 'disabled' } })).toEqual({
            temperature: 0.1,
            reasoning: { enabled: false },
        });
    });
});
