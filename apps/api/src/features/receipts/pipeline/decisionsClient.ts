import type { OpenRouterUsage } from '../../categorization/llm/openRouterClient';

/**
 * OpenRouter Decisions API. A different surface from chat completions: you send a
 * `state` plus named typed questions and get calibrated probabilities back, with
 * output tokens billed at zero. Alpha endpoint, so it is versioned separately
 * from OPENROUTER_BASE_URL.
 */
export const OPENROUTER_DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions';

export type NoulQuestion = {
    readonly type: 'noul';
    readonly instructions: string;
    readonly criteria: { readonly true: string; readonly false: string };
};

export type DecisionsInput = {
    readonly apiKey: string;
    readonly model: string;
    readonly state: string;
    readonly questions: Readonly<Record<string, NoulQuestion>>;
    readonly timeoutMs: number;
    readonly url?: string;
    readonly fetchImpl?: typeof fetch;
};

export type DecisionsResult = {
    /** Probability per question name. Missing answers are omitted, never defaulted. */
    readonly nouls: Readonly<Record<string, number>>;
    readonly usage: OpenRouterUsage | null;
};

export type CompleteDecisions = (input: DecisionsInput) => Promise<DecisionsResult>;

export async function completeDecisions(input: DecisionsInput): Promise<DecisionsResult> {
    const doFetch = input.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs);
    try {
        const response = await doFetch(input.url ?? OPENROUTER_DECISIONS_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${input.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: input.model,
                state: input.state,
                questions: input.questions,
            }),
            signal: controller.signal,
        });
        if (!response.ok) {
            const body = await response.text();
            throw new Error(`decisions ${response.status}: ${body.slice(0, 200)}`);
        }
        const parsed: unknown = await response.json();
        return { nouls: parseNouls(parsed), usage: parseDecisionsUsage(parsed) };
    } finally {
        clearTimeout(timer);
    }
}

function parseNouls(payload: unknown): Record<string, number> {
    if (!payload || typeof payload !== 'object') {
        return {};
    }
    const answers = (payload as { answers?: unknown }).answers;
    if (!answers || typeof answers !== 'object') {
        return {};
    }
    const out: Record<string, number> = {};
    for (const [name, answer] of Object.entries(answers as Record<string, unknown>)) {
        if (!answer || typeof answer !== 'object') {
            continue;
        }
        const noul = (answer as { noul?: unknown }).noul;
        if (typeof noul === 'number' && Number.isFinite(noul)) {
            out[name] = noul;
        }
    }
    return out;
}

/** Decisions usage uses snake_case token counts, unlike the chat completions shape. */
export function parseDecisionsUsage(payload: unknown): OpenRouterUsage | null {
    if (!payload || typeof payload !== 'object') {
        return null;
    }
    const usage = (payload as { usage?: unknown }).usage;
    if (!usage || typeof usage !== 'object') {
        return null;
    }
    const record = usage as { input_tokens?: unknown; output_tokens?: unknown; cost?: unknown };
    const promptTokens = typeof record.input_tokens === 'number' ? record.input_tokens : 0;
    const completionTokens = typeof record.output_tokens === 'number' ? record.output_tokens : 0;
    const costUsd = typeof record.cost === 'number' ? record.cost : null;
    if (promptTokens === 0 && completionTokens === 0 && costUsd == null) {
        return null;
    }
    return {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        cachedTokens: null,
        costUsd,
    };
}
