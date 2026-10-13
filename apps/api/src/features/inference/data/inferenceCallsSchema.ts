import type { Insertable, Selectable } from 'kysely';

import type { InferencePurpose } from '../inferencePurpose';

/** `ok`, or how the request failed before a usable reply came back. */
export type InferenceCallOutcome = 'ok' | 'http-error' | 'timeout' | 'cancelled' | 'network-error' | 'invalid-response';

/** One OpenRouter request: what it cost, never what was sent or returned. */
export type InferenceCallsTable = {
    id: string;
    calledAt: Date;
    purpose: InferencePurpose;
    /** The model requested. */
    model: string;
    /** The model OpenRouter reports having served, when it reports one. */
    responseModel: string | null;
    provider: string | null;
    generationId: string | null;
    outcome: InferenceCallOutcome;
    httpStatus: number | null;
    durationMs: number;
    promptTokens: number | null;
    /** Includes reasoning tokens. */
    completionTokens: number | null;
    reasoningTokens: number | null;
    cachedTokens: number | null;
    costUsd: number | null;
};

export type InferenceCallRow = Selectable<InferenceCallsTable>;
export type NewInferenceCall = Insertable<InferenceCallsTable>;
