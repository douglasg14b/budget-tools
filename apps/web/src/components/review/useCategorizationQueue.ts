import type { CategorizationQueueDto } from '@budget-tools/web-sdk';
import { getCategorizationQueueOptions, getCategorizationQueueQueryKey } from '@budget-tools/web-sdk';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

export function refreshQueueRequest(): { query: { refresh: true } } {
    return { query: { refresh: true } };
}

export function expandQueueRequest(): { query: { expand: true } } {
    return { query: { expand: true } };
}

let warmPrefetchStarted = false;

/**
 * Review-list queue: full scored working set, expand older only.
 * Classify uses `useClassifyQueue` so it does not share this cache.
 */
export function useCategorizationQueue() {
    const queryClient = useQueryClient();
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isExpanding, setIsExpanding] = useState(false);
    const [refreshError, setRefreshError] = useState<unknown>();
    const [expandError, setExpandError] = useState<unknown>();
    const expandLock = useRef(false);

    const queueQuery = useQuery({
        ...getCategorizationQueueOptions(),
        staleTime: Number.POSITIVE_INFINITY,
        refetchOnWindowFocus: false,
    });

    async function refreshPredictions(): Promise<void> {
        setIsRefreshing(true);
        setRefreshError(undefined);
        try {
            const data = await queryClient.fetchQuery({
                ...getCategorizationQueueOptions(refreshQueueRequest()),
                staleTime: 0,
            });
            queryClient.setQueryData(getCategorizationQueueQueryKey(), data);
            warmPrefetchStarted = false;
        } catch (error) {
            setRefreshError(error);
        } finally {
            setIsRefreshing(false);
        }
    }

    async function expandQueue(): Promise<void> {
        if (expandLock.current || isRefreshing) {
            return;
        }
        const current = queryClient.getQueryData<CategorizationQueueDto>(getCategorizationQueueQueryKey());
        if (!current?.hasMore) {
            return;
        }
        expandLock.current = true;
        setIsExpanding(true);
        setExpandError(undefined);
        try {
            const data = await queryClient.fetchQuery({
                ...getCategorizationQueueOptions(expandQueueRequest()),
                staleTime: 0,
            });
            queryClient.setQueryData(getCategorizationQueueQueryKey(), data);
        } catch (error) {
            setExpandError(error);
            warmPrefetchStarted = false;
        } finally {
            expandLock.current = false;
            setIsExpanding(false);
        }
    }

    useEffect(() => {
        if (isRefreshing || isExpanding || !queueQuery.isSuccess || !queueQuery.data.hasMore || warmPrefetchStarted) {
            return;
        }
        warmPrefetchStarted = true;
        void expandQueue();
    }, [isExpanding, isRefreshing, queueQuery.data?.hasMore, queueQuery.isSuccess]);

    return {
        expandError,
        expandQueue,
        isExpanding,
        isRefreshing,
        queueQuery,
        refreshError,
        refreshPredictions,
    };
}
