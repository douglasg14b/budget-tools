import type { ReceiptExtractStatus } from '@budget-tools/web-sdk';

import { formatTransactionDate } from '../formatTransactionDate';
import { formatYnabAmount } from '../formatYnabAmount';
import classes from './ReceiptSlip.module.css';
import { receiptExtractCopy } from './receiptExtractCopy';

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
    readonly selected: boolean;
    readonly slip: InboxSlipModel;
    readonly boundLabel: string | null;
    readonly onSelect: (id: string) => void;
};

export function ReceiptSlip({ selected, slip, boundLabel, onSelect }: ReceiptSlipProps) {
    return (
        <button
            type="button"
            className={classes.slip}
            data-selected={selected || undefined}
            aria-pressed={selected}
            onClick={() => {
                onSelect(slip.id);
            }}
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
                {boundLabel ? (
                    <span className={classes.bound}>Bound · {boundLabel}</span>
                ) : (
                    <span className={classes.unbound}>Unbound</span>
                )}
            </span>
        </button>
    );
}
