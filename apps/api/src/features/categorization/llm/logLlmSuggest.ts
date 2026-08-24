import { getRequestId } from '../../../services/requestContext';

/**
 * Structured LLM-suggest trace. Never pass secrets (API keys, Authorization headers).
 */
export function logLlmSuggest(message: string, details?: Record<string, unknown>): void {
    console.log('LLM suggest', {
        message,
        requestId: getRequestId(),
        ...details,
    });
}
