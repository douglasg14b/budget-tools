import type { CategorizationQueueItemDto } from '@budget-tools/web-sdk';
import { Button, Loader } from '@mantine/core';
import type { ReactNode } from 'react';
import { useEffect } from 'react';

import { BackendErrorNotice } from '../BackendErrorNotice';
import classes from './QueueLoadState.module.css';
import type { QueueSearchState } from './queueSearchParams';

type QueueLoadStateProps = {
    children: ReactNode;
    error: unknown;
    filtersActive?: boolean;
    hasMore?: boolean;
    isExpanding?: boolean;
    isPending: boolean;
    onClearFilters?: () => void;
    onNeedMore?: () => void;
    pendingCount: number | undefined;
    visibleCount: number;
};

/**
 * Loading, error, and empty wells shared by the queue list and classify pages.
 */
export function QueueLoadState({
    children,
    error,
    filtersActive = false,
    hasMore = false,
    isExpanding = false,
    isPending,
    onClearFilters,
    onNeedMore,
    pendingCount,
    visibleCount,
}: QueueLoadStateProps) {
    useEffect(() => {
        if (isPending || visibleCount > 0 || !hasMore || !onNeedMore) {
            return;
        }
        onNeedMore();
    }, [hasMore, isPending, onNeedMore, visibleCount]);

    if (isPending) {
        return (
            <div className={classes.statusWell}>
                <Loader type="dots" size="md" color="gray" />
                <p className={classes.statusCopy}>Scoring a batch of pending transactions…</p>
            </div>
        );
    }

    if (error) {
        return <BackendErrorNotice error={error} />;
    }

    if (pendingCount === 0) {
        return (
            <div className={classes.statusWell}>
                <p className={classes.statusTitle}>All caught up</p>
                <p className={classes.statusCopy}>No pending transactions.</p>
            </div>
        );
    }

    if (visibleCount === 0) {
        if (hasMore) {
            return (
                <div className={classes.statusWell}>
                    <Loader type="dots" size="md" color="gray" />
                    <p className={classes.statusCopy}>
                        {isExpanding
                            ? 'Scoring more pending transactions to match these filters…'
                            : 'Looking for matching pending transactions…'}
                    </p>
                </div>
            );
        }

        return (
            <div className={classes.statusWell}>
                <p className={classes.statusTitle}>Nothing matches</p>
                <p className={classes.statusCopy}>No transactions match these filters.</p>
                {filtersActive && onClearFilters ? (
                    <Button
                        className={classes.clearFilters}
                        variant="subtle"
                        color="gray"
                        size="compact-md"
                        onClick={onClearFilters}
                    >
                        Clear filters
                    </Button>
                ) : null}
            </div>
        );
    }

    return children;
}

export function filterQueueItems(
    items: readonly CategorizationQueueItemDto[],
    search: Pick<QueueSearchState, 'accountId' | 'tiers'>,
): CategorizationQueueItemDto[] {
    return items.filter((item) => {
        if (search.tiers && !search.tiers.includes(item.proposal.tier)) {
            return false;
        }
        if (search.accountId && item.transaction.accountId !== search.accountId) {
            return false;
        }
        return true;
    });
}
