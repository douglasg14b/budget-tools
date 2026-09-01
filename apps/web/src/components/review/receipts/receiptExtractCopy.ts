import type { ReceiptExtractStatus } from '@budget-tools/web-sdk';

export type ReceiptExtractCopyInput = {
    readonly extractStatus: ReceiptExtractStatus | null;
    readonly totalsDisagree: boolean;
};

export function receiptExtractCopy(input: ReceiptExtractCopyInput): string {
    if (input.totalsDisagree) {
        return 'Printed totals don’t agree — won’t auto-bind.';
    }
    switch (input.extractStatus) {
        case 'pending':
            return 'Extracting line items…';
        case 'gated':
            return 'Extract matches the printed total.';
        case 'ungated':
            return 'Amounts need a look before they can own cents.';
        case 'failed':
            return 'Couldn’t read this receipt.';
        case null:
            return 'Waiting on extract.';
    }
}
