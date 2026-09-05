import type { ReceiptExtractStatus } from '@budget-tools/web-sdk';
import { Link, useLocation } from 'react-router-dom';

import { formatTransactionDate } from '../formatTransactionDate';
import { formatYnabAmount } from '../formatYnabAmount';
import classes from './ReceiptSlip.module.css';
import { receiptExtractCopy } from './receiptExtractCopy';
import { RECEIPTS_INBOX_FROM_STATE } from './receiptsInboxBack';

export type InboxSlipModel = {
    readonly id: string;
    readonly vendor: string | null;
    readonly purchaseDate: string | null;
    readonly printedMilliunits: number | null;
    readonly extractStatus: ReceiptExtractStatus | null;
    readonly totalsDisagree: boolean;
    readonly transactionId: string | null;
    readonly imageSrc: string | null;
};

type ReceiptSlipProps = {
    readonly slip: InboxSlipModel;
};

export function ReceiptSlip({ slip }: ReceiptSlipProps) {
    const location = useLocation();
    return (
        <Link
            className={classes.slip}
            to={{ pathname: `/receipts/${slip.id}`, search: location.search }}
            state={RECEIPTS_INBOX_FROM_STATE}
        >
            {slip.imageSrc ? (
                <img alt="" className={classes.thumb} src={slip.imageSrc} />
            ) : (
                <span className={classes.blank} />
            )}
            <span className={classes.body}>
                <span className={classes.vendor}>{slip.vendor ?? 'Unknown vendor'}</span>
                <span className={classes.meta}>
                    {slip.purchaseDate ? formatTransactionDate(slip.purchaseDate) : 'No date yet'}
                    {slip.printedMilliunits != null ? (
                        <>
                            <span aria-hidden="true"> · </span>
                            {formatYnabAmount(slip.printedMilliunits)}
                        </>
                    ) : null}
                </span>
                <span className={classes.status}>{receiptExtractCopy(slip)}</span>
                {slip.transactionId ? (
                    <span className={classes.bound}>Bound</span>
                ) : (
                    <span className={classes.unbound}>Unbound</span>
                )}
            </span>
        </Link>
    );
}
