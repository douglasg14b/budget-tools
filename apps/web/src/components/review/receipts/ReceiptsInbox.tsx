import type { ReceiptDto } from '@budget-tools/web-sdk';
import { listReceiptsInfiniteOptions } from '@budget-tools/web-sdk';
import { useInfiniteQuery } from '@tanstack/react-query';
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

const RECEIPTS_PAGE_SIZE = 20;

type ReceiptsInboxProps = {
    readonly live: boolean;
};

/**
 * Burst capture without a focused transaction. Live lists SQLite receipts; Practice is session-only.
 */
export function ReceiptsInbox({ live }: ReceiptsInboxProps) {
    const { receipts: sessionReceipts, setReceipts: setSessionReceipts } = usePracticeReceipts();

    const listQuery = useInfiniteQuery({
        ...listReceiptsInfiniteOptions({ query: { limit: RECEIPTS_PAGE_SIZE } }),
        initialPageParam: {},
        getNextPageParam: (page) => page.nextCursor ?? undefined,
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
                : sessionReceipts.map(slipFromPractice),
        [live, listQuery.data?.pages, sessionReceipts],
    );

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

            <ol className={classes.stack}>
                {live && listQuery.isPending ? <li className={classes.empty}>Loading receipts…</li> : null}
                {!listQuery.isPending && slips.length === 0 ? (
                    <li className={classes.empty}>No receipts yet. Add a photo to start matching.</li>
                ) : null}
                {slips.map((slip) => (
                    <li key={slip.id}>
                        <ReceiptSlip slip={slip} />
                    </li>
                ))}
            </ol>
            {live ? (
                <QueuePrefetchSentinel
                    enabled={listQuery.hasNextPage}
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
