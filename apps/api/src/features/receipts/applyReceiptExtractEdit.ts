import type { ReceiptExtractStatus } from './data/receiptsSchema';
import { isAmazonReceiptVendor } from './extractReceipt';
import type { ReceiptExtractPayload } from './parseReceiptExtract';
import { formatReceiptExtractDump, parseReceiptExtract } from './parseReceiptExtract';
import type { ReceiptExtractLine } from './pipeline/arithmeticGate';
import { arithmeticGate } from './pipeline/arithmeticGate';

export type ReceiptExtractEdit = {
    readonly vendor: string | null;
    readonly purchaseDate: string | null;
    readonly printedMilliunits: number | null;
    readonly taxMilliunits: number;
    readonly discountMilliunits: number;
    readonly lines: readonly ReceiptExtractLine[];
};

export type ReceiptExtractEditApplied = {
    readonly kind: 'applied';
    readonly extractStatus: ReceiptExtractStatus;
    readonly vendor: string | null;
    readonly purchaseDate: string | null;
    readonly printedMilliunits: number | null;
    readonly totalsDisagree: false;
    readonly extractJson: string;
    readonly rawText: string | null;
};

export type ReceiptExtractEditResult = { readonly kind: 'amazon' } | ReceiptExtractEditApplied;

/**
 * Rebuilds extract JSON and status from a reviewer edit. Human totals clear totalsDisagree.
 */
export function applyReceiptExtractEdit(input: {
    readonly previousExtractJson: string | null;
    readonly edit: ReceiptExtractEdit;
}): ReceiptExtractEditResult {
    const vendor = emptyToNull(input.edit.vendor);
    if (isAmazonReceiptVendor(vendor)) {
        return { kind: 'amazon' };
    }
    const purchaseDate = emptyToNull(input.edit.purchaseDate);
    const printedMilliunits = input.edit.printedMilliunits;
    const previous = parseReceiptExtract(input.previousExtractJson);
    const gated =
        printedMilliunits != null &&
        arithmeticGate({
            lines: input.edit.lines,
            taxMilliunits: input.edit.taxMilliunits,
            discountMilliunits: input.edit.discountMilliunits,
            printedMilliunits,
        }).gated;
    const hasKeys = Boolean(vendor && purchaseDate && printedMilliunits != null);
    const extractStatus: ReceiptExtractStatus = !hasKeys ? 'failed' : gated ? 'gated' : 'ungated';
    const payload: ReceiptExtractPayload = {
        repaired: previous?.repaired ?? false,
        gated,
        headerPrintedMilliunits: previous?.headerPrintedMilliunits ?? null,
        ocrPrintedMilliunits: previous?.ocrPrintedMilliunits ?? null,
        taxMilliunits: input.edit.taxMilliunits,
        discountMilliunits: input.edit.discountMilliunits,
        lines: [...input.edit.lines],
        error: null,
    };
    return {
        kind: 'applied',
        extractStatus,
        vendor,
        purchaseDate,
        printedMilliunits,
        totalsDisagree: false,
        extractJson: JSON.stringify(payload),
        rawText: formatReceiptExtractDump(input.edit.lines, input.edit.taxMilliunits, input.edit.discountMilliunits),
    };
}

function emptyToNull(value: string | null): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}
