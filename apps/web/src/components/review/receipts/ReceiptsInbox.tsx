import type { ReceiptDto } from '@budget-tools/web-sdk';
import { listReceiptsOptions } from '@budget-tools/web-sdk';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { BackendErrorNotice } from '../../BackendErrorNotice';
import { ClassifyReceiptCapture } from '../classify/ClassifyReceiptCapture';
import { usePracticeReceipts } from '../classify/PracticeReceiptsContext';
import type { PracticeReceipt } from '../classify/practiceReceipts';
import { liveReceiptImageSrc, practiceReceiptImageSrc } from '../classify/receiptCaptureAttach';
import { useReceiptCapture } from '../classify/useReceiptCapture';
import type { InboxSlipModel } from './ReceiptSlip';
import { ReceiptSlip } from './ReceiptSlip';
import classes from './ReceiptsInbox.module.css';

type ReceiptsInboxProps = {
    readonly live: boolean;
};

/**
 * Burst capture without a focused transaction. Live lists SQLite receipts; Practice is session-only.
 */
export function ReceiptsInbox({ live }: ReceiptsInboxProps) {
    const { receipts: sessionReceipts, setReceipts: setSessionReceipts } = usePracticeReceipts();

    const listQuery = useQuery({
        ...listReceiptsOptions(),
        enabled: live,
        refetchInterval: (query) =>
            query.state.data?.receipts.some((row) => row.extractStatus === 'pending') ? 2_000 : false,
        refetchOnWindowFocus: false,
    });

    const slips = useMemo(
        () => (live ? (listQuery.data?.receipts ?? []).map(slipFromDto) : sessionReceipts.map(slipFromPractice)),
        [live, listQuery.data?.receipts, sessionReceipts],
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
        imageSrc: liveReceiptImageSrc(row),
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
    };
}
