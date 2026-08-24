import type { CategorizationQueueDto } from '@budget-tools/web-sdk';
import { getCategorizationQueueOptions } from '@budget-tools/web-sdk';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { mergeClassifyQueue } from './classify/mergeClassifyQueue';

export const CLASSIFY_QUEUE_QUERY_KEY = ['categorization', 'classify-queue'] as const;

const NEWEST_WINDOW_SENTINEL = '__window__';

type ExpandDirection = 'older' | 'newer';

/**
 * Windowed classify queue. Uses a stable query key so j/k does not refetch,
 * and never writes the review-list queue cache.
 */
export function useClassifyQueue(transactionId: string | undefined) {
    const queryClient = useQueryClient();
    const [isExpandingOlder, setIsExpandingOlder] = useState(false);
    const [isExpandingNewer, setIsExpandingNewer] = useState(false);
    const [expandError, setExpandError] = useState<unknown>();
    const expandLock = useRef(false);
    const aroundId = transactionId || NEWEST_WINDOW_SENTINEL;

    const queueQuery = useQuery({
        queryKey: CLASSIFY_QUEUE_QUERY_KEY,
        queryFn: async () => {
            const result = await queryClient.fetchQuery({
                ...getCategorizationQueueOptions({ query: { around: aroundId } }),
                staleTime: 0,
            });
            return result;
        },
        staleTime: Number.POSITIVE_INFINITY,
        refetchOnWindowFocus: false,
    });

    const jumpAround = useCallback(
        async (nextId: string): Promise<void> => {
            if (expandLock.current) {
                return;
            }
            expandLock.current = true;
            setExpandError(undefined);
            try {
                const data = await queryClient.fetchQuery({
                    ...getCategorizationQueueOptions({ query: { around: nextId } }),
                    staleTime: 0,
                });
                queryClient.setQueryData(CLASSIFY_QUEUE_QUERY_KEY, data);
            } catch (error) {
                setExpandError(error);
            } finally {
                expandLock.current = false;
            }
        },
        [queryClient],
    );

    useEffect(() => {
        if (!transactionId || queueQuery.isPending || expandLock.current) {
            return;
        }
        const items = queueQuery.data?.items ?? [];
        if (items.length === 0) {
            return;
        }
        if (items.some((item) => item.transaction.id === transactionId)) {
            return;
        }
        void jumpAround(transactionId);
    }, [jumpAround, queueQuery.data?.items, queueQuery.isPending, transactionId]);

    async function expand(direction: ExpandDirection): Promise<void> {
        if (expandLock.current) {
            return;
        }
        const current = queryClient.getQueryData<CategorizationQueueDto>(CLASSIFY_QUEUE_QUERY_KEY);
        if (!current) {
            return;
        }
        if (direction === 'older' && !current.hasMoreOlder) {
            return;
        }
        if (direction === 'newer' && !current.hasMoreNewer) {
            return;
        }
        const cursorId =
            direction === 'older' ? current.items.at(-1)?.transaction.id : current.items[0]?.transaction.id;
        if (!cursorId) {
            return;
        }

        expandLock.current = true;
        if (direction === 'older') {
            setIsExpandingOlder(true);
        } else {
            setIsExpandingNewer(true);
        }
        setExpandError(undefined);
        try {
            const data = await queryClient.fetchQuery({
                ...getCategorizationQueueOptions({
                    query: direction === 'older' ? { olderThan: cursorId } : { newerThan: cursorId },
                }),
                staleTime: 0,
            });
            const merged = mergeClassifyQueue(current, data, direction);
            queryClient.setQueryData(CLASSIFY_QUEUE_QUERY_KEY, merged);
        } catch (error) {
            setExpandError(error);
        } finally {
            expandLock.current = false;
            setIsExpandingOlder(false);
            setIsExpandingNewer(false);
        }
    }

    return {
        expandError,
        expandNewer: () => {
            void expand('newer');
        },
        expandOlder: () => {
            void expand('older');
        },
        hasMoreNewer: queueQuery.data?.hasMoreNewer === true,
        hasMoreOlder: queueQuery.data?.hasMoreOlder === true,
        isExpandingNewer,
        isExpandingOlder,
        queueQuery,
    };
}
