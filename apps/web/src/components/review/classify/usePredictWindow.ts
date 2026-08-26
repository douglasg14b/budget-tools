import type { CategorizationQueueDto, CategorizationQueueItemDto } from '@budget-tools/web-sdk';
import { Categorization } from '@budget-tools/web-sdk';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { getBackendErrorMessage } from '../../BackendErrorNotice';
import { CLASSIFY_QUEUE_QUERY_KEY } from '../useClassifyQueue';
import { mergePredictedItems } from './mergeClassifyQueue';
import { selectPredictWindowIds } from './selectPredictWindowIds';

type UsePredictWindowInput = {
    readonly currentId: string | undefined;
    readonly items: readonly CategorizationQueueItemDto[];
};

type UsePredictWindowResult = {
    readonly errorMessage: string | null;
    readonly isPending: boolean;
};

/**
 * Scores a window of unscored classify-queue items around the focused row.
 */
export function usePredictWindow({ currentId, items }: UsePredictWindowInput): UsePredictWindowResult {
    const queryClient = useQueryClient();
    const transactionIds = selectPredictWindowIds(items, currentId);

    const query = useQuery({
        queryKey: ['categorization', 'predict', ...transactionIds],
        queryFn: async ({ signal }) => {
            const result = await Categorization.request4({
                body: { transactionIds },
                signal,
                throwOnError: true,
            });
            if (!result.data) {
                throw new Error('Predict returned no data');
            }
            queryClient.setQueryData<CategorizationQueueDto>(CLASSIFY_QUEUE_QUERY_KEY, (current) =>
                current ? mergePredictedItems(current, result.data.items) : current,
            );
            return result.data;
        },
        enabled: transactionIds.length > 0,
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: Number.POSITIVE_INFINITY,
        refetchOnWindowFocus: false,
        retry: retryPredict,
    });

    return {
        errorMessage: query.isError ? formatPredictError(query.error) : null,
        isPending: transactionIds.length > 0 && query.isFetching,
    };
}

function retryPredict(failureCount: number, error: unknown): boolean {
    return isAbortError(error) && failureCount < 1;
}

function formatPredictError(error: unknown): string | null {
    const message = getBackendErrorMessage(error);
    if (isAbortError(error) && /aborted|cancelled/i.test(message) && !/timed out/i.test(message)) {
        return null;
    }
    return message === 'Request failed.' ? 'Scoring unavailable' : message;
}

function isAbortError(error: unknown): boolean {
    return Boolean(
        error && typeof error === 'object' && 'name' in error && (error as { name?: string }).name === 'AbortError',
    );
}
