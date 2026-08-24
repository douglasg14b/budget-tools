import type { CategorizationQueueItemDto, LlmSuggestOverlayDto } from '@budget-tools/web-sdk';
import { Categorization } from '@budget-tools/web-sdk';
import { useQuery } from '@tanstack/react-query';

import { getBackendErrorMessage } from '../../BackendErrorNotice';
import { applyLlmOverlay, needsLlmSuggest, overlayQueryKey } from './applyLlmOverlay';

type UseLlmOverlayInput = {
    readonly current: CategorizationQueueItemDto | undefined;
    readonly currentDecided: boolean;
    readonly next: CategorizationQueueItemDto | undefined;
};

type UseLlmOverlayResult = {
    readonly errorMessage: string | null;
    readonly isPending: boolean;
    readonly item: CategorizationQueueItemDto | undefined;
};

/**
 * Fetches a JIT LLM overlay for the focused classify card, and prefetches the next remaining uncertain item.
 */
export function useLlmOverlay({ current, currentDecided, next }: UseLlmOverlayInput): UseLlmOverlayResult {
    const currentEnabled = Boolean(current && needsLlmSuggest(current, currentDecided));
    const nextEnabled = Boolean(next && needsLlmSuggest(next, false));

    const currentQuery = useQuery({
        queryKey: ['categorization', 'llm-suggest', ...(current ? overlayQueryKey(current) : ['none'])],
        queryFn: ({ signal }) => fetchOverlay(current?.transaction.id ?? '', signal),
        enabled: currentEnabled,
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: Number.POSITIVE_INFINITY,
        refetchOnWindowFocus: false,
        retry: retryLlmSuggest,
    });

    useQuery({
        queryKey: ['categorization', 'llm-suggest', ...(next ? overlayQueryKey(next) : ['prefetch-none'])],
        queryFn: ({ signal }) => fetchOverlay(next?.transaction.id ?? '', signal),
        enabled: nextEnabled,
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: Number.POSITIVE_INFINITY,
        refetchOnWindowFocus: false,
        retry: retryLlmSuggest,
    });

    const overlay = currentQuery.data;
    const item = current && overlay ? applyLlmOverlay(current, overlay) : current;

    return {
        errorMessage: currentQuery.isError ? formatLlmError(currentQuery.error) : null,
        isPending: currentEnabled && currentQuery.isFetching,
        item,
    };
}

async function fetchOverlay(transactionId: string, signal?: AbortSignal): Promise<LlmSuggestOverlayDto> {
    const result = await Categorization.request2({
        body: { transactionId },
        signal,
        throwOnError: true,
    });
    if (!result.data) {
        throw new Error('LLM suggestion returned no data');
    }
    return result.data;
}

function retryLlmSuggest(failureCount: number, error: unknown): boolean {
    return isAbortError(error) && failureCount < 1;
}

export function formatLlmError(error: unknown): string | null {
    const message = getBackendErrorMessage(error);
    if (/OPENROUTER_API_KEY is not configured/i.test(message)) {
        return null;
    }
    if (isAbortError(error) && /aborted|cancelled/i.test(message) && !/timed out/i.test(message)) {
        return null;
    }
    return message === 'Request failed.' ? 'LLM unavailable' : message;
}

function isAbortError(error: unknown): boolean {
    return Boolean(
        error && typeof error === 'object' && 'name' in error && (error as { name?: string }).name === 'AbortError',
    );
}
