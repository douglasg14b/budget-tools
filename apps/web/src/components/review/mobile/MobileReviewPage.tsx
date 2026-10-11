import type { CategorizationQueueItemDto } from '@budget-tools/web-sdk';
import { Button, Modal, UnstyledButton } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { BackendErrorNotice } from '../../BackendErrorNotice';
import { useClassifySession } from '../classify/useClassifySession';
import { QueueLoadState } from '../QueueLoadState';
import { serializeQueueSearchParams } from '../queueSearchParams';
import { useClassifyQueueView } from '../useClassifyQueueView';
import { MobileClassifySheet } from './MobileClassifySheet';
import type { MobileReviewView } from './MobileReviewList';
import { MobileReviewList } from './MobileReviewList';
import classes from './MobileReviewPage.module.css';
import { decisionSummary } from './mobileReviewRows';

/** Router state marking a sheet opened from the list, so closing can pop history instead of pushing. */
type SheetState = { fromList?: boolean } | null;

const UNDO_TOAST_MS = 5000;

/**
 * Phone Review: one classify session behind both the list (`/`) and the full-screen card
 * (`/classify`). Mounted once for both paths so decisions, drafts and scroll survive the switch.
 */
export function MobileReviewPage() {
    const view = useClassifyQueueView();
    const { queueQuery, visibleItems, hasMoreOlder, querySettled, expandOlder } = view;
    const noMatches = queueQuery.isSuccess && visibleItems.length === 0;

    // Filters that match nothing loaded yet keep paging older rows, as `QueueLoadState` does.
    useEffect(() => {
        if (noMatches && hasMoreOlder && querySettled) {
            expandOlder();
        }
    }, [expandOlder, hasMoreOlder, noMatches, querySettled]);

    if (!queueQuery.isSuccess) {
        return (
            <QueueLoadState
                error={queueQuery.isError ? queueQuery.error : undefined}
                isPending={queueQuery.isPending}
                loadingCopy="Loading pending transactions…"
                pendingCount={undefined}
                visibleCount={0}
            >
                {null}
            </QueueLoadState>
        );
    }

    // Unlike `QueueLoadState`, an empty filter result keeps the session mounted: unmounting would
    // drop Practice decisions and the search box needed to clear the filter.
    return (
        <>
            {view.expandError ? <BackendErrorNotice error={view.expandError} /> : null}
            {/* A mode switch starts a fresh session, as on the desktop. */}
            <MobileReviewSession key={view.mode} view={view} />
        </>
    );
}

type MobileReviewSessionProps = {
    view: ReturnType<typeof useClassifyQueueView>;
};

function MobileReviewSession({ view }: MobileReviewSessionProps) {
    const location = useLocation();
    const navigate = useNavigate();
    const displayedItemRef = useRef<CategorizationQueueItemDto | undefined>(undefined);
    const [listView, setListView] = useState<MobileReviewView>('all');
    const [confirmingBulk, setConfirmingBulk] = useState(false);
    const [returnFocusId, setReturnFocusId] = useState<string | undefined>(undefined);
    const { search, visibleItems, querySettled } = view;
    const sheetOpen = location.pathname === '/classify';
    const classify = useClassifySession(visibleItems, view.categoryGroups, {
        displayedItemRef,
        live: view.live,
        navigate: 'remaining',
        onCurrentIdChange: view.writeTransactionId,
        requestedId: search.transactionId,
    });
    const toast = useUndoToast(classify.session.undoStack);
    const needNewer = querySettled ? view.expandNewer : ignoreNeedMore;
    const needOlder = querySettled ? view.expandOlder : ignoreNeedMore;

    function openSheet(transactionId: string): void {
        classify.setCurrentId(transactionId);
        void navigate(
            { pathname: '/classify', search: serializeQueueSearchParams({ ...search, transactionId }).toString() },
            { state: { fromList: true } satisfies SheetState },
        );
    }

    function closeSheet(): void {
        setReturnFocusId(classify.current?.transaction.id);
        if ((location.state as SheetState)?.fromList) {
            void navigate(-1);
            return;
        }
        void navigate({ pathname: '/', search: location.search }, { replace: true });
    }

    function requestAcceptAllCertain(): void {
        if (classify.certainRemaining.length === 0) {
            return;
        }
        // Live writes to YNAB; one stray tap should not file a whole batch there.
        if (view.mode === 'live') {
            setConfirmingBulk(true);
            return;
        }
        classify.acceptAllCertain();
    }

    const lastId = classify.session.undoStack.at(-1);
    const lastDecision = lastId ? classify.session.byId[lastId] : undefined;
    const lastItem = lastId ? visibleItems.find((item) => item.transaction.id === lastId) : undefined;

    return (
        <>
            <MobileReviewList
                allItems={view.items}
                classify={classify}
                focusId={returnFocusId}
                hasMoreNewer={view.hasMoreNewer}
                hasMoreOlder={view.hasMoreOlder}
                isExpandingNewer={view.isExpandingNewer}
                isExpandingOlder={view.isExpandingOlder}
                items={visibleItems}
                mode={view.mode}
                isSearching={!querySettled || (visibleItems.length === 0 && view.hasMoreOlder)}
                pendingCount={view.queueQuery.data?.pendingCount}
                search={search}
                summary={view.queueQuery.data?.summary}
                view={listView}
                onAcceptAllCertain={requestAcceptAllCertain}
                onNeedNewer={needNewer}
                onNeedOlder={needOlder}
                onOpen={openSheet}
                onSearchChange={view.updateSearch}
                onViewChange={setListView}
            />
            {sheetOpen ? (
                <MobileClassifySheet
                    classify={classify}
                    displayedItemRef={displayedItemRef}
                    hasMoreNewer={view.hasMoreNewer}
                    hasMoreOlder={view.hasMoreOlder}
                    isExpandingNewer={view.isExpandingNewer}
                    isExpandingOlder={view.isExpandingOlder}
                    items={visibleItems}
                    live={view.live}
                    searchValue={search.q}
                    onAcceptAllCertain={requestAcceptAllCertain}
                    onClose={closeSheet}
                    onNeedNewer={needNewer}
                    onNeedOlder={needOlder}
                    onSearchChange={(q) => {
                        view.updateSearch({ q });
                    }}
                />
            ) : null}
            {/* The sheet's card shows its own copy of this error. */}
            {classify.liveError && !sheetOpen ? (
                <div className={classes.liveError}>
                    <BackendErrorNotice error={new Error(classify.liveError)} />
                </div>
            ) : null}
            {toast.visible && !sheetOpen && lastDecision ? (
                <div className={classes.toast} role="status">
                    <span className={classes.toastCopy}>
                        <span className={classes.toastPayee}>
                            {lastItem ? classify.payeeName(lastItem) : 'Transaction'}
                        </span>
                        <span className={classes.toastDecision}>{decisionSummary(lastDecision)}</span>
                    </span>
                    <UnstyledButton
                        className={classes.toastUndo}
                        onClick={() => {
                            classify.undo();
                            toast.dismiss();
                        }}
                    >
                        Undo
                    </UnstyledButton>
                </div>
            ) : null}
            <Modal
                centered
                opened={confirmingBulk}
                title={`Accept ${classify.certainRemaining.length} certain?`}
                onClose={() => {
                    setConfirmingBulk(false);
                }}
            >
                <p className={classes.confirmCopy}>
                    Live mode: each accepted category is written to YNAB. Undo pulls them back one at a time.
                </p>
                <div className={classes.confirmActions}>
                    <Button
                        variant="default"
                        onClick={() => {
                            setConfirmingBulk(false);
                        }}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={() => {
                            classify.acceptAllCertain();
                            setConfirmingBulk(false);
                        }}
                    >
                        Accept all
                    </Button>
                </div>
            </Modal>
        </>
    );
}

/** Shows for a few seconds whenever a new decision lands on the undo stack. */
function useUndoToast(undoStack: readonly string[]): { visible: boolean; dismiss: () => void } {
    const [visible, setVisible] = useState(false);
    const depth = undoStack.length;
    const previousDepth = useRef(depth);

    useEffect(() => {
        const grew = depth > previousDepth.current;
        previousDepth.current = depth;
        if (!grew) {
            setVisible(false);
            return;
        }
        setVisible(true);
        const timer = window.setTimeout(() => {
            setVisible(false);
        }, UNDO_TOAST_MS);
        return () => {
            window.clearTimeout(timer);
        };
    }, [depth]);

    return {
        visible,
        dismiss: () => {
            setVisible(false);
        },
    };
}

function ignoreNeedMore(): void {
    return;
}
