export type OpenRouterReasoningEffort = 'low' | 'medium' | 'high';

/**
 * `disabled` sends `reasoning.enabled: false`. Some endpoints reject that with
 * OpenRouter 400 "Reasoning is mandatory", so those models must use `effort`.
 */
export type OpenRouterReasoningPolicy =
    | { readonly mode: 'disabled' }
    | { readonly mode: 'effort'; readonly effort: OpenRouterReasoningEffort };

/** How a model is called through OpenRouter, independent of which feature calls it. */
export type OpenRouterModelProfile = {
    readonly temperature: number;
    readonly reasoning: OpenRouterReasoningPolicy;
};

/** Thrown before any request when a model has no profile. Register the model rather than guessing its options. */
export class UnknownOpenRouterModelError extends Error {
    constructor(
        readonly model: string,
        source?: string,
    ) {
        super(
            `OpenRouter model "${model}"${source ? ` (from ${source})` : ''} has no profile. ` +
                `Add it to MODEL_PROFILES in openRouterModelProfiles.ts with its temperature and reasoning policy.`,
        );
        this.name = 'UnknownOpenRouterModelError';
    }
}

const NO_REASONING: OpenRouterModelProfile = { temperature: 0.1, reasoning: { mode: 'disabled' } };

/**
 * Every chat-completions model the API may call, keyed by OpenRouter slug without a
 * `:variant` suffix. Unlisted models are rejected, so a new model is a deliberate entry here.
 */
const MODEL_PROFILES: Readonly<Record<string, OpenRouterModelProfile>> = {
    'qwen/qwen3.7-flash': NO_REASONING,
    'qwen/qwen3.7-plus': NO_REASONING,
    'qwen/qwen3.8-max': { temperature: 0.1, reasoning: { mode: 'effort', effort: 'low' } },
};

function profileKey(model: string): string {
    return model
        .trim()
        .toLowerCase()
        .replace(/:[^/]*$/, '');
}

/** @throws UnknownOpenRouterModelError when the model is not registered. */
export function resolveOpenRouterModelProfile(model: string): OpenRouterModelProfile {
    const profile = MODEL_PROFILES[profileKey(model)];
    if (!profile) {
        throw new UnknownOpenRouterModelError(model);
    }
    return profile;
}

/**
 * Startup check over configured models, keyed by the setting that names them.
 * @throws UnknownOpenRouterModelError for the first unregistered model.
 */
export function assertOpenRouterModelsRegistered(modelsBySource: Readonly<Record<string, string>>): void {
    for (const [source, model] of Object.entries(modelsBySource)) {
        if (!MODEL_PROFILES[profileKey(model)]) {
            throw new UnknownOpenRouterModelError(model, source);
        }
    }
}

/** Request-body fields derived from a profile. */
export function openRouterProfileRequestFields(profile: OpenRouterModelProfile) {
    return {
        temperature: profile.temperature,
        reasoning: profile.reasoning.mode === 'effort' ? { effort: profile.reasoning.effort } : { enabled: false },
    };
}
