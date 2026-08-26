import type { AmazonSplitOverlayDto, CategorizationQueueItemDto } from '@budget-tools/web-sdk';
import { AmazonOrders, Categorization } from '@budget-tools/web-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getBackendErrorMessage } from '../../BackendErrorNotice';
import { amazonSyncWindow } from './amazonSyncWindow';
import { needsAmazonSuggest, overlayQueryKey } from './applyLlmOverlay';

type UseAmazonSplitOverlayInput = {
    readonly current: CategorizationQueueItemDto | undefined;
    readonly currentDecided: boolean;
    readonly prefetchPrevious: CategorizationQueueItemDto | undefined;
    readonly prefetchNext: CategorizationQueueItemDto | undefined;
};

type UseAmazonSplitOverlayResult = {
    readonly errorMessage: string | null;
    readonly isPending: boolean;
    readonly overlay: AmazonSplitOverlayDto | undefined;
    readonly syncError: string | null;
    readonly syncing: boolean;
    readonly sync: () => void;
};

/**
 * Fetches an Amazon-only split overlay for the focused classify card, and prefetches Amazon neighbors.
 */
export function useAmazonSplitOverlay({
    current,
    currentDecided,
    prefetchPrevious,
    prefetchNext,
}: UseAmazonSplitOverlayInput): UseAmazonSplitOverlayResult {
    const queryClient = useQueryClient();
    const currentEnabled = Boolean(current && needsAmazonSuggest(current, currentDecided));

    const currentQuery = useQuery({
        queryKey: ['categorization', 'amazon-suggest', ...(current ? overlayQueryKey(current) : ['none'])],
        queryFn: ({ signal }) => fetchAmazonOverlay(current?.transaction.id ?? '', signal),
        enabled: currentEnabled,
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: Number.POSITIVE_INFINITY,
        refetchOnWindowFocus: false,
        retry: retryAmazonSuggest,
    });

    usePrefetchAmazonOverlay(prefetchPrevious);
    usePrefetchAmazonOverlay(prefetchNext);

    const syncMutation = useMutation({
        mutationFn: async () => {
            const date = current?.transaction.date;
            if (!date) {
                throw new Error('No transaction date to sync');
            }
            const window = amazonSyncWindow(date);
            const result = await AmazonOrders.request2({
                body: { from: window.from, to: window.to },
                throwOnError: true,
            });
            if (!result.data) {
                throw new Error('Amazon sync returned no data');
            }
            return result.data;
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['categorization', 'amazon-suggest'] });
        },
    });

    return {
        errorMessage: currentQuery.isError ? formatAmazonError(currentQuery.error) : null,
        isPending: currentEnabled && currentQuery.data === undefined && currentQuery.isFetching,
        overlay: currentQuery.data,
        syncError: syncMutation.isError ? formatAmazonError(syncMutation.error) : null,
        syncing: syncMutation.isPending,
        sync: () => {
            syncMutation.mutate();
        },
    };
}

function usePrefetchAmazonOverlay(item: CategorizationQueueItemDto | undefined): void {
    useQuery({
        queryKey: ['categorization', 'amazon-suggest', ...(item ? overlayQueryKey(item) : ['none'])],
        queryFn: ({ signal }) => fetchAmazonOverlay(item?.transaction.id ?? '', signal),
        enabled: Boolean(item && needsAmazonSuggest(item)),
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: Number.POSITIVE_INFINITY,
        refetchOnWindowFocus: false,
        retry: retryAmazonSuggest,
    });
}

async function fetchAmazonOverlay(transactionId: string, signal?: AbortSignal): Promise<AmazonSplitOverlayDto> {
    const result = await Categorization.request3({
        body: { transactionId },
        signal,
        throwOnError: true,
    });
    if (!result.data) {
        throw new Error('Amazon suggestion returned no data');
    }
    return result.data;
}

function retryAmazonSuggest(failureCount: number, error: unknown): boolean {
    return isAbortError(error) && failureCount < 1;
}

function formatAmazonError(error: unknown): string | null {
    const message = getBackendErrorMessage(error);
    if (/OPENROUTER_API_KEY is not configured/i.test(message)) {
        return null;
    }
    if (isAbortError(error) && /aborted|cancelled/i.test(message) && !/timed out/i.test(message)) {
        return null;
    }
    return message === 'Request failed.' ? 'Amazon unavailable' : message;
}

function isAbortError(error: unknown): boolean {
    return Boolean(
        error && typeof error === 'object' && 'name' in error && (error as { name?: string }).name === 'AbortError',
    );
}
