import type { CategorizationQueueItemDto } from '@budget-tools/web-sdk';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { BackendErrorNotice } from '../components/BackendErrorNotice';
import { isCertainProposal } from '../components/review/classify/isCertainProposal';
import type { AccountOption } from '../components/review/QueueFilters';
import { QueueFilters } from '../components/review/QueueFilters';
import { QueueItemCard } from '../components/review/QueueItemCard';
import { filterQueueItems, QueueLoadState } from '../components/review/QueueLoadState';
import { QueuePrefetchSentinel } from '../components/review/QueuePrefetchSentinel';
import { QueueSearchInput } from '../components/review/QueueSearchInput';
import { QueueSummaryBar } from '../components/review/QueueSummaryBar';
import { QueueToolbar } from '../components/review/QueueToolbar';
import type { QueueSearchState } from '../components/review/queueSearchParams';
import {
    parseQueueSearchParams,
    queueFiltersActive,
    serializeQueueSearchParams,
    toggleTierFilter,
} from '../components/review/queueSearchParams';
import { useCategorizationQueue } from '../components/review/useCategorizationQueue';
import classes from './ReviewQueuePage.module.css';

export function ReviewQueuePage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const search = parseQueueSearchParams(searchParams);
    const { expandError, expandQueue, isExpanding, isRefreshing, queueQuery, refreshError, refreshPredictions } =
        useCategorizationQueue();

    const items = queueQuery.data?.items ?? [];
    const visibleItems = useMemo(() => filterQueueItems(items, search), [items, search]);
    const accounts = useMemo(() => listAccounts(items), [items]);

    function updateSearch(patch: Partial<QueueSearchState>): void {
        setSearchParams(serializeQueueSearchParams({ ...search, ...patch }), { replace: true });
    }

    return (
        <div className={classes.page}>
            <QueueToolbar
                generatedAt={queueQuery.data?.generatedAt}
                isRefreshing={isRefreshing}
                onRefresh={() => {
                    void refreshPredictions();
                }}
                refreshDisabled={queueQuery.isPending || isRefreshing || isExpanding}
                totalCount={queueQuery.data?.summary.total}
                visibleCount={queueQuery.data ? visibleItems.length : undefined}
            />
            {queueQuery.data ? (
                <div className={classes.controls}>
                    <QueueSummaryBar
                        summary={queueQuery.data.summary}
                        pendingCount={queueQuery.data.pendingCount}
                        certainCount={items.filter((item) => isCertainProposal(item.proposal)).length}
                        selectedTiers={search.tiers}
                        onToggleTier={(tier) => {
                            updateSearch({ tiers: toggleTierFilter(search.tiers, tier) });
                        }}
                    />
                    <div className={classes.filters}>
                        <QueueSearchInput
                            value={search.q}
                            onChange={(q) => {
                                updateSearch({ q });
                            }}
                        />
                        <QueueFilters
                            accounts={accounts}
                            accountId={search.accountId}
                            onAccountIdChange={(accountId) => {
                                updateSearch({ accountId });
                            }}
                        />
                    </div>
                </div>
            ) : null}
            {refreshError ? <BackendErrorNotice error={refreshError} /> : null}
            {expandError ? <BackendErrorNotice error={expandError} /> : null}
            <QueueLoadState
                error={queueQuery.isError ? queueQuery.error : undefined}
                filtersActive={queueFiltersActive(search)}
                hasMore={queueQuery.data?.hasMore === true}
                isExpanding={isExpanding}
                isPending={queueQuery.isPending}
                pendingCount={queueQuery.data?.pendingCount}
                visibleCount={visibleItems.length}
                onClearFilters={() => {
                    updateSearch({ tiers: undefined, accountId: undefined, q: undefined });
                }}
                onNeedMore={expandQueue}
            >
                <div className={classes.list}>
                    {visibleItems.map((item) => (
                        <QueueItemCard key={item.transaction.id} item={item} />
                    ))}
                    <QueuePrefetchSentinel
                        enabled={queueQuery.data?.hasMore === true}
                        isLoading={isExpanding}
                        requireScroll
                        onNeedMore={expandQueue}
                    />
                </div>
            </QueueLoadState>
        </div>
    );
}

function listAccounts(items: CategorizationQueueItemDto[]): AccountOption[] {
    const namesById = new Map<string, string>();
    for (const item of items) {
        if (!namesById.has(item.transaction.accountId)) {
            namesById.set(item.transaction.accountId, item.transaction.accountName);
        }
    }

    return [...namesById.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((left, right) => left.name.localeCompare(right.name));
}
