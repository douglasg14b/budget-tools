import { getCategoriesOptions } from '@budget-tools/web-sdk';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { BackendErrorNotice } from '../components/BackendErrorNotice';
import { ClassifyTable } from '../components/review/classify/ClassifyTable';
import { ClassifyWorkspace } from '../components/review/classify/ClassifyWorkspace';
import { filterQueueItems, QueueLoadState } from '../components/review/QueueLoadState';
import { parseQueueSearchParams, serializeQueueSearchParams } from '../components/review/queueSearchParams';
import { useCategorizationQueue } from '../components/review/useCategorizationQueue';
import classes from './ClassifyPage.module.css';

type ClassifyPageProps = {
    layout: 'card' | 'table';
};

export function ClassifyPage({ layout }: ClassifyPageProps) {
    const [searchParams, setSearchParams] = useSearchParams();
    const search = parseQueueSearchParams(searchParams);
    const { expandError, expandQueue, isExpanding, queueQuery } = useCategorizationQueue();

    const categoriesQuery = useQuery({
        ...getCategoriesOptions(),
        staleTime: Number.POSITIVE_INFINITY,
        refetchOnWindowFocus: false,
    });

    const items = queueQuery.data?.items ?? [];
    const visibleItems = useMemo(() => filterQueueItems(items, search), [items, search]);

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
                hasMore={queueQuery.data?.hasMore === true}
                isExpanding={isExpanding}
                isPending={queueQuery.isPending}
                pendingCount={queueQuery.data?.pendingCount}
                visibleCount={visibleItems.length}
                onClearFilters={() => {
                    setSearchParams(serializeQueueSearchParams({ ...search, tiers: undefined, accountId: undefined }), {
                        replace: true,
                    });
                }}
                onNeedMore={expandQueue}
            >
                {layout === 'table' ? (
                    <ClassifyTable
                        categoryGroups={categoriesQuery.data?.groups ?? []}
                        hasMore={queueQuery.data?.hasMore === true}
                        isExpanding={isExpanding}
                        items={visibleItems}
                        onNeedMore={expandQueue}
                    />
                ) : (
                    <ClassifyWorkspace
                        categoryGroups={categoriesQuery.data?.groups ?? []}
                        hasMore={queueQuery.data?.hasMore === true}
                        isExpanding={isExpanding}
                        items={visibleItems}
                        onNeedMore={expandQueue}
                    />
                )}
            </QueueLoadState>
        </div>
    );
}
