import { getCategoriesOptions } from '@budget-tools/web-sdk';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { BackendErrorNotice } from '../components/BackendErrorNotice';
import { ClassifyTable } from '../components/review/classify/ClassifyTable';
import { ClassifyWorkspace } from '../components/review/classify/ClassifyWorkspace';
import { pinFocusedQueueItem } from '../components/review/classify/mergeClassifyQueue';
import { filterQueueItems, QueueLoadState } from '../components/review/QueueLoadState';
import { parseQueueSearchParams, serializeQueueSearchParams } from '../components/review/queueSearchParams';
import { sortQueueItemsByDateDesc } from '../components/review/sortQueueItems';
import { useClassifyQueue } from '../components/review/useClassifyQueue';
import classes from './ClassifyPage.module.css';

type ClassifyPageProps = {
    layout: 'card' | 'table';
};

export function ClassifyPage({ layout }: ClassifyPageProps) {
    const [searchParams, setSearchParams] = useSearchParams();
    const search = parseQueueSearchParams(searchParams);
    const {
        expandError,
        expandNewer,
        expandOlder,
        hasMoreNewer,
        hasMoreOlder,
        isExpandingNewer,
        isExpandingOlder,
        queueQuery,
    } = useClassifyQueue(search.transactionId);

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

    const categoriesQuery = useQuery({
        ...getCategoriesOptions(),
        staleTime: Number.POSITIVE_INFINITY,
        refetchOnWindowFocus: false,
    });

    const items = queueQuery.data?.items ?? [];
    const visibleItems = useMemo(
        () =>
            pinFocusedQueueItem(sortQueueItemsByDateDesc(filterQueueItems(items, search)), items, search.transactionId),
        [items, search],
    );

    return (
        <div className={classes.page}>
            <header className={classes.header}>
                <h1 className={classes.title}>{layout === 'table' ? 'Table' : 'Classify'}</h1>
                <p className={classes.note}>Session only — nothing is written to YNAB yet.</p>
            </header>
            {expandError ? <BackendErrorNotice error={expandError} /> : null}
            <QueueLoadState
                error={queueQuery.isError ? queueQuery.error : undefined}
                filtersActive={search.tiers !== undefined || Boolean(search.accountId)}
                hasMore={hasMoreOlder}
                isExpanding={isExpandingOlder}
                isPending={queueQuery.isPending}
                pendingCount={queueQuery.data?.pendingCount}
                visibleCount={visibleItems.length}
                onClearFilters={() => {
                    setSearchParams(serializeQueueSearchParams({ ...search, tiers: undefined, accountId: undefined }), {
                        replace: true,
                    });
                }}
                onNeedMore={expandOlder}
            >
                {layout === 'table' ? (
                    <ClassifyTable
                        categoryGroups={categoriesQuery.data?.groups ?? []}
                        hasMoreNewer={hasMoreNewer}
                        hasMoreOlder={hasMoreOlder}
                        isExpandingNewer={isExpandingNewer}
                        isExpandingOlder={isExpandingOlder}
                        items={visibleItems}
                        requestedId={search.transactionId}
                        onCurrentIdChange={writeTransactionId}
                        onNeedNewer={expandNewer}
                        onNeedOlder={expandOlder}
                    />
                ) : (
                    <ClassifyWorkspace
                        categoryGroups={categoriesQuery.data?.groups ?? []}
                        hasMoreNewer={hasMoreNewer}
                        hasMoreOlder={hasMoreOlder}
                        isExpandingNewer={isExpandingNewer}
                        isExpandingOlder={isExpandingOlder}
                        items={visibleItems}
                        requestedId={search.transactionId}
                        onCurrentIdChange={writeTransactionId}
                        onNeedNewer={expandNewer}
                        onNeedOlder={expandOlder}
                    />
                )}
            </QueueLoadState>
        </div>
    );
}
