import type { CategorizationQueueItemDto, LlmSuggestOverlayDto } from '@budget-tools/web-sdk';
import { Categorization } from '@budget-tools/web-sdk';
import { useQuery } from '@tanstack/react-query';

import { getBackendErrorMessage } from '../../BackendErrorNotice';
import { applyLlmOverlay, needsLlmSuggest, overlayQueryKey } from './applyLlmOverlay';

type UseLlmOverlayInput = {
    readonly current: CategorizationQueueItemDto | undefined;
    readonly currentDecided: boolean;
    readonly prefetchPrevious: CategorizationQueueItemDto | undefined;
    readonly prefetchNext: CategorizationQueueItemDto | undefined;
};

type UseLlmOverlayResult = {
    readonly errorMessage: string | null;
    readonly isPending: boolean;
    readonly item: CategorizationQueueItemDto | undefined;
};

/**
 * Fetches a JIT LLM overlay for the focused classify card, and prefetches uncertain neighbors.
 */
export function useLlmOverlay({
    current,
    currentDecided,
    prefetchPrevious,
    prefetchNext,
}: UseLlmOverlayInput): UseLlmOverlayResult {
    const currentEnabled = Boolean(current && needsLlmSuggest(current, currentDecided));

    const currentQuery = useQuery({
        queryKey: ['categorization', 'llm-suggest', ...(current ? overlayQueryKey(current) : ['none'])],
        queryFn: ({ signal }) => fetchOverlay(current?.transaction.id ?? '', signal),
        enabled: currentEnabled,
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: Number.POSITIVE_INFINITY,
        refetchOnWindowFocus: false,
        retry: retryLlmSuggest,
    });

    usePrefetchOverlay(prefetchPrevious, 'prefetch-previous');
    usePrefetchOverlay(prefetchNext, 'prefetch-next');

    const overlay = currentQuery.data;
    const item = current && overlay ? applyLlmOverlay(current, overlay) : current;

    return {
        errorMessage: currentQuery.isError ? formatLlmError(currentQuery.error) : null,
        isPending: currentEnabled && currentQuery.isFetching,
        item,
    };
}

function usePrefetchOverlay(item: CategorizationQueueItemDto | undefined, scope: string): void {
    useQuery({
        queryKey: ['categorization', 'llm-suggest', scope, ...(item ? overlayQueryKey(item) : ['none'])],
        queryFn: ({ signal }) => fetchOverlay(item?.transaction.id ?? '', signal),
        enabled: Boolean(item && needsLlmSuggest(item, false)),
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: Number.POSITIVE_INFINITY,
        refetchOnWindowFocus: false,
        retry: retryLlmSuggest,
    });
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
