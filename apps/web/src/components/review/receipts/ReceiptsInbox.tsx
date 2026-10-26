import type { ReceiptDto } from '@budget-tools/web-sdk';
import { listReceiptsInfiniteOptions } from '@budget-tools/web-sdk';
import { Button } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useCallback, useMemo } from 'react';

import { BackendErrorNotice } from '../../BackendErrorNotice';
import { ClassifyReceiptCapture } from '../classify/ClassifyReceiptCapture';
import { usePracticeReceipts } from '../classify/PracticeReceiptsContext';
import type { PracticeReceipt } from '../classify/practiceReceipts';
import { liveReceiptThumbSrc, practiceReceiptImageSrc } from '../classify/receiptCaptureAttach';
import { useReceiptCapture } from '../classify/useReceiptCapture';
import { QueuePrefetchSentinel } from '../QueuePrefetchSentinel';
import type { InboxSlipModel } from './ReceiptSlip';
import { ReceiptSlip } from './ReceiptSlip';
import classes from './ReceiptsInbox.module.css';
import type { ReceiptsSearchState } from './receiptsSearchParams';
import { receiptMatchesSearch, receiptsFilterCount } from './receiptsSearchParams';

const RECEIPTS_PAGE_SIZE = 20;

type ReceiptsInboxProps = {
    /** Rendered above the list; null when the page shows it elsewhere (the phone header). */
    readonly filterBar: ReactNode;
    readonly live: boolean;
    readonly onClearFilters: () => void;
    readonly search: ReceiptsSearchState;
};

/** Typing pause before a search goes to the server. */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * Burst capture without a focused transaction. Live lists SQLite receipts; Practice is session-only.
 * Filters run on the server for Live so they reach receipts not paged in yet.
 */
export function ReceiptsInbox({ filterBar, live, onClearFilters, search }: ReceiptsInboxProps) {
    const { receipts: sessionReceipts, setReceipts: setSessionReceipts } = usePracticeReceipts();
    const [debouncedQ] = useDebouncedValue(search.q ?? '', SEARCH_DEBOUNCE_MS);
    const filtered = receiptsFilterCount(search) > 0;

    const listQuery = useInfiniteQuery({
        ...listReceiptsInfiniteOptions({
            query: {
                limit: RECEIPTS_PAGE_SIZE,
                q: debouncedQ.trim() || undefined,
                reimbursable: search.reimbursable || undefined,
                bound: search.bound,
                issue: search.issue,
            },
        }),
        initialPageParam: {},
        getNextPageParam: (page) => page.nextCursor ?? undefined,
        // Keep the current rows on screen while a new filter loads instead of flashing "Loading".
        placeholderData: keepPreviousData,
        enabled: live,
        // Refetching walks every loaded page; pending rows are the newest, so that stays cheap.
        refetchInterval: (query) =>
            query.state.data?.pages.some((page) => page.receipts.some((row) => row.extractStatus === 'pending'))
                ? 2_000
                : false,
        refetchOnWindowFocus: false,
    });
    const { fetchNextPage } = listQuery;
    const loadMore = useCallback(() => {
        void fetchNextPage();
    }, [fetchNextPage]);

    const slips = useMemo(
        () =>
            live
                ? (listQuery.data?.pages ?? []).flatMap((page) => page.receipts.map(slipFromDto))
                : sessionReceipts.filter((row) => receiptMatchesSearch(row, search)).map(slipFromPractice),
        [live, listQuery.data?.pages, sessionReceipts, search],
    );
    const searching = live && (listQuery.isPlaceholderData || (search.q ?? '') !== debouncedQ);
    const listEmpty = !(live && listQuery.isPending) && slips.length === 0;

    const capture = useReceiptCapture({
        live,
        transactionId: null,
        keepCameraOnAttach: true,
        onLiveCreated: () => undefined,
        onPracticeReceipt: (row) => {
            setSessionReceipts((previous) => [...previous, row]);
        },
    });

    return (
        <div className={classes.inbox}>
            <section className={classes.capture} aria-labelledby="inbox-capture-title">
                <h2 id="inbox-capture-title" className={classes.captureTitle}>
                    Capture
                </h2>
                <p className={classes.captureLede}>
                    Snap or upload a tape. It starts unbound. After you submit, the camera opens for the next one.
                </p>
                <ClassifyReceiptCapture capture={capture} submitLabel="Add to inbox" />
            </section>

            {listQuery.error ? <BackendErrorNotice error={listQuery.error} /> : null}

            {filterBar}

            <ol className={classes.stack} aria-busy={searching || undefined} data-searching={searching || undefined}>
                {live && listQuery.isPending ? <li className={classes.empty}>Loading receipts…</li> : null}
                {listEmpty && !filtered ? (
                    <li className={classes.empty}>No receipts yet. Add a photo to start matching.</li>
                ) : null}
                {listEmpty && filtered ? (
                    <li className={classes.empty}>
                        {searching ? 'Looking for matching receipts…' : 'No receipts match these filters.'}
                        {searching ? null : (
                            <Button variant="subtle" color="gray" onClick={onClearFilters}>
                                Clear filters
                            </Button>
                        )}
                    </li>
                ) : null}
                {slips.map((slip) => (
                    <li key={slip.id}>
                        <ReceiptSlip slip={slip} />
                    </li>
                ))}
            </ol>
            {live ? (
                <QueuePrefetchSentinel
                    // The previous filter's rows are only a placeholder; their cursor is not this query's.
                    enabled={listQuery.hasNextPage && !listQuery.isPlaceholderData}
                    isLoading={listQuery.isFetchingNextPage}
                    loadingHint="Loading more receipts…"
                    onNeedMore={loadMore}
                />
            ) : null}
        </div>
    );
}

function slipFromDto(row: ReceiptDto): InboxSlipModel {
    return {
        id: row.id,
        vendor: row.vendor,
        purchaseDate: row.purchaseDate,
        printedMilliunits: row.printedMilliunits,
        extractStatus: row.extractStatus,
        totalsDisagree: row.totalsDisagree,
        transactionId: row.transactionId,
        imageSrc: liveReceiptThumbSrc(row.id),
        extractJson: row.extractJson,
        bindCheckOutcome: row.bindCheckOutcome,
    };
}

function slipFromPractice(row: PracticeReceipt): InboxSlipModel {
    return {
        id: row.id,
        vendor: row.vendor,
        purchaseDate: row.purchaseDate,
        printedMilliunits: row.printedMilliunits,
        extractStatus: row.extractStatus,
        totalsDisagree: row.totalsDisagree,
        transactionId: row.transactionId,
        imageSrc: practiceReceiptImageSrc(row),
        extractJson: row.extractJson,
    };
}
