import { describe, expect, it } from 'vitest';

import { formatLlmError } from '../useLlmOverlay';

describe('formatLlmError', () => {
    it('stays quiet when the OpenRouter key is missing', () => {
        expect(formatLlmError({ message: 'OPENROUTER_API_KEY is not configured' })).toBeNull();
    });

    it('surfaces OpenRouter and timeout failures', () => {
        expect(formatLlmError({ message: 'OpenRouter rejected the API key (invalid or expired)' })).toBe(
            'OpenRouter rejected the API key (invalid or expired)',
        );
        expect(formatLlmError({ message: 'OpenRouter request timed out' })).toBe('OpenRouter request timed out');
    });

    it('does not treat a client abort as a visible failure', () => {
        const abort = new DOMException('The operation was aborted.', 'AbortError');
        expect(formatLlmError(abort)).toBeNull();
    });
});
