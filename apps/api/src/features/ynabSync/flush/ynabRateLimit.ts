export class YnabRateLimitError extends Error {
    readonly retryAfterMs: number;

    constructor(retryAfterMs: number) {
        super('YNAB rate limit exceeded');
        this.name = 'YnabRateLimitError';
        this.retryAfterMs = retryAfterMs;
    }
}

/**
 * Returns a backoff in milliseconds when the error is a YNAB 429, otherwise undefined.
 */
export function ynabRetryAfterMs(error: unknown): number | undefined {
    if (!isRecord(error)) {
        return undefined;
    }
    const status = nestedNumber(error, ['status']) ?? nestedNumber(error, ['response', 'status']);
    const errorId = nestedString(error, ['error', 'id']);
    if (status !== 429 && errorId !== '429') {
        return undefined;
    }
    const retryAfter =
        nestedNumber(error, ['retryAfter']) ??
        nestedNumber(error, ['response', 'headers', 'retry-after']) ??
        nestedNumber(error, ['response', 'headers', 'Retry-After']);
    if (retryAfter !== undefined) {
        return retryAfter > 1000 ? retryAfter : retryAfter * 1000;
    }
    return 60_000;
}

export function ynabErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
        const detail = isRecord(error) ? nestedString(error, ['error', 'detail']) : undefined;
        return detail ?? error.message;
    }
    if (isRecord(error)) {
        const detail = nestedString(error, ['error', 'detail']) ?? nestedString(error, ['message']);
        if (detail) {
            return detail;
        }
    }
    return 'YNAB request failed';
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object';
}

function nestedString(record: Record<string, unknown>, path: readonly string[]): string | undefined {
    const value = nestedValue(record, path);
    return typeof value === 'string' && value.trim() ? value : undefined;
}

function nestedNumber(record: Record<string, unknown>, path: readonly string[]): number | undefined {
    const value = nestedValue(record, path);
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
}

function nestedValue(record: Record<string, unknown>, path: readonly string[]): unknown {
    let current: unknown = record;
    for (const key of path) {
        if (!isRecord(current) || !(key in current)) {
            return undefined;
        }
        current = current[key];
    }
    return current;
}
