import { LlmSuggestError } from './LlmSuggestError';
import { logLlmSuggest } from './logLlmSuggest';

export type OpenRouterChatInput = {
    readonly apiKey: string;
    readonly baseUrl: string;
    readonly model: string;
    readonly system: string;
    readonly user: string;
    readonly timeoutMs: number;
    readonly signal?: AbortSignal;
};

export type OpenRouterPrediction = {
    readonly categoryName: string | null;
    readonly categoryGroupName: string | null;
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

const JSON_SCHEMA = {
    type: 'object',
    properties: {
        categoryName: { type: 'string' },
        categoryGroupName: { type: 'string' },
        confidence: { type: 'number' },
        rationale: { type: 'string' },
        payeeName: { type: ['string', 'null'] },
    },
    required: ['categoryName', 'categoryGroupName', 'confidence', 'rationale', 'payeeName'],
    additionalProperties: false,
} as const;

type ChatCompletionResponse = {
    id?: string;
    model?: string;
    choices?: Array<{
        message?: { content?: string | null };
    }>;
    usage?: unknown;
};

/**
 * Calls OpenRouter chat completions with constrained JSON and thinking disabled.
 */
export async function completeLlmPrediction(input: OpenRouterChatInput): Promise<OpenRouterPrediction> {
    const endpoint = `${input.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, input.timeoutMs);

    const onParentAbort = (): void => {
        controller.abort();
    };
    input.signal?.addEventListener('abort', onParentAbort, { once: true });

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            signal: controller.signal,
            headers: {
                Authorization: `Bearer ${input.apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://budget-tools.local',
                'X-Title': 'Budget Tools',
            },
            body: JSON.stringify({
                model: input.model,
                temperature: 0.1,
                reasoning: { enabled: false },
                response_format: {
                    type: 'json_schema',
                    json_schema: {
                        name: 'category_prediction',
                        strict: true,
                        schema: JSON_SCHEMA,
                    },
                },
                messages: [
                    { role: 'system', content: input.system },
                    { role: 'user', content: input.user },
                ],
            }),
        });

        if (!response.ok) {
            const detail = (await response.text()).trim();
            throw new LlmSuggestError(503, openRouterFailureMessage(response.status, detail));
        }

        const payload = (await response.json()) as ChatCompletionResponse;
        const content = payload.choices?.[0]?.message?.content?.trim();
        if (!content) {
            throw new LlmSuggestError(503, 'OpenRouter returned an empty completion');
        }

        const prediction = parsePrediction(content);
        const usage = parseOpenRouterUsage(payload.usage);
        logLlmSuggest('inference cost', {
            completionTokens: usage?.completionTokens ?? null,
            cost: formatUsd(usage?.costUsd ?? null),
            costUsd: usage?.costUsd ?? null,
            generationId: payload.id ?? null,
            model: payload.model ?? input.model,
            promptTokens: usage?.promptTokens ?? null,
            totalTokens: usage?.totalTokens ?? null,
            cachedTokens: usage?.cachedTokens ?? null,
        });
        logLlmSuggest('openrouter completion', {
            model: payload.model ?? input.model,
            parsed: prediction,
        });
        return prediction;
    } catch (error) {
        if (error instanceof LlmSuggestError) {
            throw error;
        }
        if (error instanceof Error && error.name === 'AbortError') {
            throw new LlmSuggestError(
                503,
                timedOut ? 'OpenRouter request timed out' : 'OpenRouter request was cancelled',
                { cause: error },
            );
        }
        throw new LlmSuggestError(503, 'OpenRouter request failed', { cause: error });
    } finally {
        clearTimeout(timer);
        input.signal?.removeEventListener('abort', onParentAbort);
    }
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

    return {
        categoryName: optionalText(record.categoryName),
        categoryGroupName: optionalText(record.categoryGroupName),
        confidence: Math.min(1, Math.max(0, confidence)),
        rationale: optionalText(record.rationale),
        payeeName: optionalText(record.payeeName),
    };
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
