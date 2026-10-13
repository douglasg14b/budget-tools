import { randomUUID } from 'node:crypto';

import type { OpenRouterUsage } from '../categorization/llm/openRouterClient';
import type { InferenceCallOutcome } from './data/inferenceCallsSchema';
import type { InferencePurpose } from './inferencePurpose';
import { recordInferenceCall } from './recordInferenceCall';

export type OpenRouterCallInput = {
    readonly purpose: InferencePurpose;
    readonly url: string;
    readonly apiKey: string;
    readonly model: string;
    /** Request body without `model`; the transport adds it so the ledger and the request agree. */
    readonly body: Readonly<Record<string, unknown>>;
    readonly timeoutMs: number;
    readonly signal?: AbortSignal;
    readonly fetchImpl?: typeof fetch;
    /** Each OpenRouter surface reports usage in its own shape. */
    readonly parseUsage: (payload: unknown) => OpenRouterUsage | null;
};

export type OpenRouterCallResult = {
    readonly payload: unknown;
    readonly usage: OpenRouterUsage | null;
};

type FailureOutcome = Exclude<InferenceCallOutcome, 'ok'>;

export class OpenRouterCallError extends Error {
    readonly outcome: FailureOutcome;
    readonly status: number | null;
    /** Response body of a non-2xx reply, trimmed. Empty otherwise. */
    readonly detail: string;

    constructor(
        outcome: FailureOutcome,
        message: string,
        details: { status?: number; detail?: string; cause?: unknown } = {},
    ) {
        super(message, { cause: details.cause });
        this.name = 'OpenRouterCallError';
        this.outcome = outcome;
        this.status = details.status ?? null;
        this.detail = details.detail ?? '';
    }
}

/**
 * The one way the API reaches OpenRouter. Posts the request, applies the timeout and the
 * caller's abort signal, and records the call in `inference_calls` whether it succeeded or
 * not. Failures throw OpenRouterCallError; callers turn that into their own errors.
 */
export async function callOpenRouter(input: OpenRouterCallInput): Promise<OpenRouterCallResult> {
    const doFetch = input.fetchImpl ?? fetch;
    const calledAt = new Date();
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

    let outcome: InferenceCallOutcome = 'ok';
    let httpStatus: number | null = null;
    let payload: unknown = null;
    let usage: OpenRouterUsage | null = null;
    try {
        const response = await doFetch(input.url, {
            method: 'POST',
            signal: controller.signal,
            headers: {
                Authorization: `Bearer ${input.apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://budget-tools.local',
                'X-Title': 'Budget Tools',
            },
            body: JSON.stringify({ model: input.model, ...input.body }),
        });
        httpStatus = response.status;
        if (!response.ok) {
            const detail = (await response.text()).trim();
            throw new OpenRouterCallError('http-error', `OpenRouter request failed (${response.status})`, {
                status: response.status,
                detail,
            });
        }
        payload = await response.json();
        usage = input.parseUsage(payload);
        return { payload, usage };
    } catch (error) {
        const failure = error instanceof OpenRouterCallError ? error : classifyFailure(error, timedOut);
        outcome = failure.outcome;
        throw failure;
    } finally {
        clearTimeout(timer);
        input.signal?.removeEventListener('abort', onParentAbort);
        await recordInferenceCall({
            id: randomUUID(),
            calledAt,
            purpose: input.purpose,
            model: input.model,
            responseModel: payloadText(payload, 'model'),
            provider: payloadText(payload, 'provider'),
            generationId: payloadText(payload, 'id'),
            outcome,
            httpStatus,
            durationMs: Date.now() - calledAt.getTime(),
            promptTokens: usage?.promptTokens ?? null,
            completionTokens: usage?.completionTokens ?? null,
            reasoningTokens: reasoningTokens(payload),
            cachedTokens: usage?.cachedTokens ?? null,
            costUsd: usage?.costUsd ?? null,
        });
    }
}

function classifyFailure(error: unknown, timedOut: boolean): OpenRouterCallError {
    if (error instanceof Error && error.name === 'AbortError') {
        return timedOut
            ? new OpenRouterCallError('timeout', 'OpenRouter request timed out', { cause: error })
            : new OpenRouterCallError('cancelled', 'OpenRouter request was cancelled', { cause: error });
    }
    if (error instanceof SyntaxError) {
        return new OpenRouterCallError('invalid-response', 'OpenRouter returned a reply that is not JSON', {
            cause: error,
        });
    }
    return new OpenRouterCallError('network-error', 'OpenRouter request failed', { cause: error });
}

function payloadText(payload: unknown, key: string): string | null {
    if (!payload || typeof payload !== 'object') {
        return null;
    }
    const value = (payload as Record<string, unknown>)[key];
    return typeof value === 'string' && value ? value : null;
}

/** Chat completions report reasoning under `usage.completion_tokens_details`; other surfaces do not. */
function reasoningTokens(payload: unknown): number | null {
    if (!payload || typeof payload !== 'object') {
        return null;
    }
    const usage = (payload as { usage?: unknown }).usage;
    if (!usage || typeof usage !== 'object') {
        return null;
    }
    const details = (usage as { completion_tokens_details?: unknown }).completion_tokens_details;
    if (!details || typeof details !== 'object') {
        return null;
    }
    const value = (details as { reasoning_tokens?: unknown }).reasoning_tokens;
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}
