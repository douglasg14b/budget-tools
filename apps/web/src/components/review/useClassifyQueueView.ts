import { getCategoriesOptions, getOperatingModeOptions } from '@budget-tools/web-sdk';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

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
    const [searchParams] = useSearchParams();
    const search = parseQueueSearchParams(searchParams);
    const [debouncedQ] = useDebouncedValue(search.q ?? '', 250);
    const querySettled = (search.q ?? '') === debouncedQ;
    const queue = useClassifyQueue(search.transactionId, debouncedQ || undefined);

    const navigate = useNavigate();
    const navigateRef = useRef(navigate);
    navigateRef.current = navigate;

    /**
     * Rewrites the query string of the URL the browser is on right now. Not `setSearchParams`: it
     * resolves against the location of its last render, so a write fired just after a tap pushed
     * `/classify` would replace that entry with the list's path and the sheet would never open.
     *
     * Stable identity on purpose: the session re-runs its "focus changed" effect whenever this
     * changes, and `navigate` changes on every location, so a back-navigation would replay the
     * old focus into the URL and ping-pong with the restored one.
     */
    const patchSearch = useCallback((patch: Partial<QueueSearchState>) => {
        const { pathname, search } = window.location;
        const previous = new URLSearchParams(search);
        const next = serializeQueueSearchParams({ ...parseQueueSearchParams(previous), ...patch });
        if (next.toString() === previous.toString()) {
            return;
        }
        // Keep the entry's router state (e.g. the sheet's "opened from the list" marker).
        const state: unknown = window.history.state?.usr;
        void navigateRef.current({ pathname, search: next.toString() }, { replace: true, state });
    }, []);

    const writeTransactionId = useCallback(
        (transactionId: string | undefined) => {
            patchSearch({ transactionId });
        },
        [patchSearch],
    );

    const updateSearch = patchSearch;

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
        updateSearch,
        visibleItems,
        writeTransactionId,
    };
}
