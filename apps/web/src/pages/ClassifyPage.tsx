import { SegmentedControl } from '@mantine/core';
import { useNavigate } from 'react-router-dom';

import { BackendErrorNotice } from '../components/BackendErrorNotice';
import { ClassifyTable } from '../components/review/classify/ClassifyTable';
import { ClassifyWorkspace } from '../components/review/classify/ClassifyWorkspace';
import { QueueLoadState } from '../components/review/QueueLoadState';
import { QueueSearchInput } from '../components/review/QueueSearchInput';
import { queueFiltersActive } from '../components/review/queueSearchParams';
import { useClassifyQueueView } from '../components/review/useClassifyQueueView';
import { operatingModeClassifyNote } from '../operatingMode/operatingModeCopy';
import classes from './ClassifyPage.module.css';

type ClassifyLayout = 'card' | 'table';

type ClassifyPageProps = {
    layout: ClassifyLayout;
};

const LAYOUT_PATHS: Record<ClassifyLayout, string> = {
    card: '/classify',
    table: '/classify/table',
};

/** Desktop classify: one card at a time, or every row in a table. Phones use `MobileReviewPage`. */
export function ClassifyPage({ layout }: ClassifyPageProps) {
    const navigate = useNavigate();
    const view = useClassifyQueueView();
    const { search, mode, live, visibleItems, queueQuery, querySettled } = view;

    return (
        <div className={classes.page}>
            <header className={classes.header}>
                {layout === 'table' ? (
                    <div className={classes.headerCopy}>
                        <h1 className={classes.title}>Table</h1>
                        <p className={classes.note} data-mode={mode}>
                            {operatingModeClassifyNote(mode)}
                        </p>
                    </div>
                ) : null}
                <div className={classes.headerControls}>
                    <SegmentedControl
                        aria-label="Classify layout"
                        className={classes.layoutToggle}
                        data={[
                            { value: 'card', label: 'Card' },
                            { value: 'table', label: 'Table' },
                        ]}
                        size="sm"
                        value={layout}
                        onChange={(next) => {
                            void navigate({
                                pathname: LAYOUT_PATHS[next as ClassifyLayout],
                                search: view.searchParams.toString(),
                            });
                        }}
                    />
                    <QueueSearchInput
                        compact={layout === 'card'}
                        value={search.q}
                        onChange={(q) => {
                            view.updateSearch({ q });
                        }}
                    />
                </div>
            </header>
            {view.expandError ? <BackendErrorNotice error={view.expandError} /> : null}
            <QueueLoadState
                error={queueQuery.isError ? queueQuery.error : undefined}
                expandingCopy="Loading more pending transactions…"
                filtersActive={queueFiltersActive(search)}
                hasMore={view.hasMoreOlder}
                isExpanding={view.isExpandingOlder}
                isPending={queueQuery.isPending}
                loadingCopy="Loading pending transactions…"
                pendingCount={queueQuery.data?.pendingCount}
                visibleCount={visibleItems.length}
                onClearFilters={() => {
                    view.updateSearch({ tiers: undefined, accountId: undefined, q: undefined });
                }}
                onNeedMore={querySettled ? view.expandOlder : undefined}
            >
                {layout === 'table' ? (
                    <ClassifyTable
                        key={mode}
                        categoryGroups={view.categoryGroups}
                        hasMoreNewer={view.hasMoreNewer}
                        hasMoreOlder={view.hasMoreOlder}
                        isExpandingNewer={view.isExpandingNewer}
                        isExpandingOlder={view.isExpandingOlder}
                        items={visibleItems}
                        live={live}
                        requestedId={search.transactionId}
                        onCurrentIdChange={view.writeTransactionId}
                        onNeedNewer={querySettled ? view.expandNewer : ignoreNeedMore}
                        onNeedOlder={querySettled ? view.expandOlder : ignoreNeedMore}
                    />
                ) : (
                    <ClassifyWorkspace
                        key={mode}
                        categoryGroups={view.categoryGroups}
                        hasMoreNewer={view.hasMoreNewer}
                        hasMoreOlder={view.hasMoreOlder}
                        isExpandingNewer={view.isExpandingNewer}
                        isExpandingOlder={view.isExpandingOlder}
                        items={visibleItems}
                        live={live}
                        requestedId={search.transactionId}
                        onCurrentIdChange={view.writeTransactionId}
                        onNeedNewer={querySettled ? view.expandNewer : ignoreNeedMore}
                        onNeedOlder={querySettled ? view.expandOlder : ignoreNeedMore}
                    />
                )}
            </QueueLoadState>
        </div>
    );
}

export function ignoreNeedMore(): void {
    return;
}
