import { callOpenRouter, OpenRouterCallError } from '../../inference/callOpenRouter';
import type { InferencePurpose } from '../../inference/inferencePurpose';
import { LlmSuggestError } from './LlmSuggestError';
import { logLlmSuggest } from './logLlmSuggest';
import { openRouterProfileRequestFields, resolveOpenRouterModelProfile } from './openRouterModelProfiles';

export type OpenRouterChatInput = {
    readonly purpose: InferencePurpose;
    readonly apiKey: string;
    readonly baseUrl: string;
    readonly model: string;
    readonly system: string;
    readonly user: string;
    readonly timeoutMs: number;
    readonly requireAlternate?: boolean;
    readonly signal?: AbortSignal;
};

export type OpenRouterImageUrlPart = {
    readonly type: 'image_url';
    readonly image_url: { readonly url: string };
};

export type OpenRouterTextPart = {
    readonly type: 'text';
    readonly text: string;
};

export type OpenRouterUserContentPart = OpenRouterTextPart | OpenRouterImageUrlPart;

export type OpenRouterJsonInput = {
    /** Recorded with the call's cost in `inference_calls`. */
    readonly purpose: InferencePurpose;
    readonly apiKey: string;
    readonly baseUrl: string;
    readonly model: string;
    readonly system: string;
    readonly user: string;
    readonly timeoutMs: number;
    readonly schemaName: string;
    readonly schema: Record<string, unknown>;
    readonly signal?: AbortSignal;
    /** Data-URL images for vision models. Omitted or empty keeps string user content. */
    readonly images?: readonly string[];
};

export type OpenRouterPrediction = {
    readonly categoryName: string | null;
    readonly categoryGroupName: string | null;
    readonly alternateCategoryName: string | null;
    readonly alternateCategoryGroupName: string | null;
    readonly confidence: number;
    readonly rationale: string | null;
    readonly payeeName: string | null;
};

export type OpenRouterUsage = {
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly totalTokens: number;
    readonly cachedTokens: number | null;
    readonly costUsd: number | null;
};

export type OpenRouterJsonResult = {
    readonly content: string;
    readonly usage: OpenRouterUsage | null;
};

function predictionSchema(requireAlternate: boolean) {
    const alternateType = requireAlternate ? { type: 'string' } : { type: ['string', 'null'] };
    return {
        type: 'object',
        properties: {
            categoryName: { type: 'string' },
            categoryGroupName: { type: 'string' },
            alternateCategoryName: alternateType,
            alternateCategoryGroupName: alternateType,
            confidence: { type: 'number' },
            rationale: { type: 'string' },
            payeeName: { type: ['string', 'null'] },
        },
        required: [
            'categoryName',
            'categoryGroupName',
            'alternateCategoryName',
            'alternateCategoryGroupName',
            'confidence',
            'rationale',
            'payeeName',
        ],
        additionalProperties: false,
    };
}

type ChatCompletionResponse = {
    id?: string;
    model?: string;
    choices?: Array<{
        message?: { content?: string | null };
    }>;
    usage?: unknown;
};

/**
 * Calls OpenRouter chat completions with constrained JSON, using the model's request profile.
 */
export async function completeLlmPrediction(input: OpenRouterChatInput): Promise<OpenRouterPrediction> {
    const { content } = await completeOpenRouterJson({
        purpose: input.purpose,
        apiKey: input.apiKey,
        baseUrl: input.baseUrl,
        model: input.model,
        system: input.system,
        user: input.user,
        timeoutMs: input.timeoutMs,
        signal: input.signal,
        schemaName: 'category_prediction',
        schema: predictionSchema(Boolean(input.requireAlternate)),
    });
    const prediction = parsePrediction(content);
    logLlmSuggest('openrouter completion', {
        model: input.model,
        parsed: prediction,
    });
    return prediction;
}

/**
 * User message content: a string for text-only callers, or a text+image_url array for vision.
 */
export function openRouterUserContent(user: string, images?: readonly string[]): string | OpenRouterUserContentPart[] {
    if (!images?.length) {
        return user;
    }
    return [{ type: 'text', text: user }, ...images.map((url) => ({ type: 'image_url' as const, image_url: { url } }))];
}

/**
 * Shared OpenRouter JSON-schema completion. Temperature and reasoning come from the model's
 * profile in openRouterModelProfiles; an unregistered model throws UnknownOpenRouterModelError
 * before any request. Returns the raw content string plus parsed usage/cost. The call is
 * recorded in `inference_calls` under `input.purpose` (see callOpenRouter).
 */
export async function completeOpenRouterJson(input: OpenRouterJsonInput): Promise<OpenRouterJsonResult> {
    // Before the request so a config error is not reported as a failed request.
    const profileFields = openRouterProfileRequestFields(resolveOpenRouterModelProfile(input.model));

    let result: Awaited<ReturnType<typeof callOpenRouter>>;
    try {
        result = await callOpenRouter({
            purpose: input.purpose,
            url: `${input.baseUrl.replace(/\/$/, '')}/chat/completions`,
            apiKey: input.apiKey,
            model: input.model,
            timeoutMs: input.timeoutMs,
            signal: input.signal,
            parseUsage: (payload) => parseOpenRouterUsage((payload as ChatCompletionResponse | null)?.usage),
            body: {
                ...profileFields,
                response_format: {
                    type: 'json_schema',
                    json_schema: {
                        name: input.schemaName,
                        strict: true,
                        schema: input.schema,
                    },
                },
                messages: [
                    { role: 'system', content: input.system },
                    { role: 'user', content: openRouterUserContent(input.user, input.images) },
                ],
            },
        });
    } catch (error) {
        throw toLlmSuggestError(error);
    }

    const payload = result.payload as ChatCompletionResponse | null;
    const content = payload?.choices?.[0]?.message?.content?.trim();
    if (!content) {
        throw new LlmSuggestError(503, 'OpenRouter returned an empty completion');
    }

    const usage = result.usage;
    logLlmSuggest('inference cost', {
        completionTokens: usage?.completionTokens ?? null,
        cost: formatUsd(usage?.costUsd ?? null),
        costUsd: usage?.costUsd ?? null,
        generationId: payload?.id ?? null,
        model: payload?.model ?? input.model,
        promptTokens: usage?.promptTokens ?? null,
        totalTokens: usage?.totalTokens ?? null,
        cachedTokens: usage?.cachedTokens ?? null,
    });
    return { content, usage };
}

function toLlmSuggestError(error: unknown): LlmSuggestError {
    if (!(error instanceof OpenRouterCallError)) {
        return new LlmSuggestError(503, 'OpenRouter request failed', { cause: error });
    }
    if (error.outcome === 'http-error' && error.status != null) {
        return new LlmSuggestError(503, openRouterFailureMessage(error.status, error.detail));
    }
    if (error.outcome === 'timeout' || error.outcome === 'cancelled') {
        return new LlmSuggestError(503, error.message, { cause: error.cause });
    }
    return new LlmSuggestError(503, 'OpenRouter request failed', { cause: error });
}

/**
 * Reads token counts and USD cost from an OpenRouter chat completion `usage` object.
 */
export function parseOpenRouterUsage(usage: unknown): OpenRouterUsage | null {
    if (!usage || typeof usage !== 'object') {
        return null;
    }

    const record = usage as Record<string, unknown>;
    const promptTokens = optionalNonNegativeInt(record.prompt_tokens);
    const completionTokens = optionalNonNegativeInt(record.completion_tokens);
    if (promptTokens == null && completionTokens == null) {
        return null;
    }

    const prompt = promptTokens ?? 0;
    const completion = completionTokens ?? 0;
    const totalTokens = optionalNonNegativeInt(record.total_tokens) ?? prompt + completion;
    const details = record.prompt_tokens_details;
    const cachedTokens =
        details && typeof details === 'object'
            ? optionalNonNegativeInt((details as Record<string, unknown>).cached_tokens)
            : null;

    return {
        promptTokens: prompt,
        completionTokens: completion,
        totalTokens,
        cachedTokens,
        costUsd: optionalFiniteNumber(record.cost),
    };
}

export function formatUsd(costUsd: number | null): string | null {
    if (costUsd == null) {
        return null;
    }
    if (costUsd === 0) {
        return '$0';
    }
    const digits = costUsd >= 0.01 ? 4 : 6;
    return `$${costUsd.toFixed(digits)}`;
}

function optionalNonNegativeInt(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        return null;
    }
    return Math.round(value);
}

function optionalFiniteNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parsePrediction(content: string): OpenRouterPrediction {
    let parsed: unknown;
    try {
        parsed = JSON.parse(content);
    } catch (error) {
        throw new LlmSuggestError(503, 'OpenRouter completion was not valid JSON', { cause: error });
    }

    if (!parsed || typeof parsed !== 'object') {
        throw new LlmSuggestError(503, 'OpenRouter completion was not an object');
    }

    const record = parsed as Record<string, unknown>;
    const confidenceRaw = record.confidence;
    const confidence = typeof confidenceRaw === 'number' && !Number.isNaN(confidenceRaw) ? confidenceRaw : 0;
    const categoryName = optionalText(record.categoryName);
    const alternateCategoryName = optionalText(record.alternateCategoryName);

    return {
        categoryName,
        categoryGroupName: optionalText(record.categoryGroupName),
        alternateCategoryName:
            alternateCategoryName && alternateCategoryName !== categoryName ? alternateCategoryName : null,
        alternateCategoryGroupName: optionalText(record.alternateCategoryGroupName),
        confidence: Math.min(1, Math.max(0, confidence)),
        rationale: optionalText(record.rationale),
        payeeName: optionalText(record.payeeName),
    };
}

/**
 * Parses a constrained JSON completion into a category prediction.
 */
export function parseOpenRouterPrediction(content: string): OpenRouterPrediction {
    return parsePrediction(content);
}

function optionalText(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function openRouterFailureMessage(status: number, detail: string): string {
    if (status === 401) {
        return 'OpenRouter rejected the API key (invalid or expired). OpenRouter reports this as "User not found".';
    }
    return `OpenRouter request failed (${status})${detail ? `: ${detail.slice(0, 300)}` : ''}`;
}
