import { formatTransactionDate } from '../formatTransactionDate';
import { formatYnabAmount } from '../formatYnabAmount';
import classes from './ClassifyReceiptContext.module.css';
import type { ReceiptOverlayModel } from './useReceiptOverlay';

type ClassifyReceiptContextProps = {
    error: string | null;
    overlay: ReceiptOverlayModel | undefined;
};

export function ClassifyReceiptContext({ error, overlay }: ClassifyReceiptContextProps) {
    return (
        <div className={classes.panel}>
            <p className={classes.label}>Receipt</p>
            {overlay?.imageSrc ? <img alt="" className={classes.thumb} src={overlay.imageSrc} /> : null}
            {overlay ? (
                <p className={classes.meta}>
                    {overlay.vendor ? <span>{overlay.vendor}</span> : <span>Unknown vendor</span>}
                    {overlay.purchaseDate ? (
                        <>
                            <span className={classes.dot} aria-hidden="true">
                                ·
                            </span>
                            <span>{formatTransactionDate(overlay.purchaseDate)}</span>
                        </>
                    ) : null}
                    {overlay.printedMilliunits != null ? (
                        <>
                            <span className={classes.dot} aria-hidden="true">
                                ·
                            </span>
                            <span>{formatYnabAmount(overlay.printedMilliunits)}</span>
                        </>
                    ) : null}
                </p>
            ) : null}
            {overlay ? <p className={classes.status}>{extractStatusCopy(overlay)}</p> : null}
            {overlay && overlay.closeMatchCount > 0 && overlay.extractStatus !== 'gated' ? (
                <p className={classes.close}>
                    {overlay.closeMatchCount === 1 ? '1 close match' : `${overlay.closeMatchCount} close matches`}
                </p>
            ) : null}
            {error ? <p className={classes.error}>{error}</p> : null}
        </div>
    );
}

function extractStatusCopy(overlay: ReceiptOverlayModel): string {
    if (overlay.totalsDisagree) {
        return 'Printed totals don’t agree — won’t auto-bind.';
    }
    switch (overlay.extractStatus) {
        case 'pending':
            return 'Extracting line items…';
        case 'gated':
            return 'Extract matches the printed total.';
        case 'ungated':
            return 'Amounts need a look before they can own cents.';
        case 'failed':
            return 'Couldn’t read this receipt.';
        case null:
            return 'Extract status unknown.';
    }
}
