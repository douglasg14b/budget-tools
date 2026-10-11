import { getCategoriesOptions, getOperatingModeOptions } from '@budget-tools/web-sdk';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { OperatingMode } from '../../operatingMode/operatingModeCopy';
import { pinFocusedQueueItem } from './classify/mergeClassifyQueue';
import { useLiveClassification } from './classify/useLiveClassification';
import { filterQueueItems } from './QueueLoadState';
import type { QueueSearchState } from './queueSearchParams';
import { parseQueueSearchParams, serializeQueueSearchParams } from './queueSearchParams';
import { sortQueueItemsByDateDesc } from './sortQueueItems';
import { useClassifyQueue } from './useClassifyQueue';

/**
 * Everything a classify surface reads: the URL filters, the windowed queue, categories, and the
 * operating mode. Shared by the desktop card / table and the phone's Review list.
 */
export function useClassifyQueueView() {
    const [searchParams, setSearchParams] = useSearchParams();
    const search = parseQueueSearchParams(searchParams);
    const [debouncedQ] = useDebouncedValue(search.q ?? '', 250);
    const querySettled = (search.q ?? '') === debouncedQ;
    const queue = useClassifyQueue(search.transactionId, debouncedQ || undefined);

    const writeTransactionId = useCallback(
        (transactionId: string | undefined) => {
            setSearchParams(
                (previous) => {
                    const current = parseQueueSearchParams(previous);
                    const next = serializeQueueSearchParams({ ...current, transactionId });
                    return next.toString() === previous.toString() ? previous : next;
                },
                { replace: true },
            );
        },
        [setSearchParams],
    );

    const updateSearch = useCallback(
        (patch: Partial<QueueSearchState>) => {
            setSearchParams(
                (previous) => serializeQueueSearchParams({ ...parseQueueSearchParams(previous), ...patch }),
                { replace: true },
            );
        },
        [setSearchParams],
    );

    const categoriesQuery = useQuery({
        ...getCategoriesOptions(),
        staleTime: Number.POSITIVE_INFINITY,
        refetchOnWindowFocus: false,
    });
    const modeQuery = useQuery(getOperatingModeOptions());
    const mode: OperatingMode = modeQuery.data?.mode ?? 'practice';
    const live = useLiveClassification(mode === 'live');

    const items = queue.queueQuery.data?.items ?? [];
    const visibleItems = useMemo(
        () =>
            pinFocusedQueueItem(sortQueueItemsByDateDesc(filterQueueItems(items, search)), items, search.transactionId),
        [items, search],
    );

    return {
        ...queue,
        categoryGroups: categoriesQuery.data?.groups ?? [],
        items,
        live,
        mode,
        querySettled,
        search,
        searchParams,
        setSearchParams,
        updateSearch,
        visibleItems,
        writeTransactionId,
    };
}
