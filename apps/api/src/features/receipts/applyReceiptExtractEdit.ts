import type { ReceiptExtractStatus } from './data/receiptsSchema';
import { isAmazonReceiptVendor } from './extractReceipt';
import type { ReceiptExtractPayload } from './parseReceiptExtract';
import { formatReceiptExtractDump, parseReceiptExtract } from './parseReceiptExtract';
import type { ReceiptExtractLine } from './pipeline/arithmeticGate';
import { arithmeticGate } from './pipeline/arithmeticGate';
import type { ReceiptReimbursableNote } from './pipeline/readReimbursableNote';

export type ReceiptExtractEdit = {
    readonly vendor: string | null;
    readonly purchaseDate: string | null;
    readonly printedMilliunits: number | null;
    readonly taxMilliunits: number;
    readonly discountMilliunits: number;
    /** Omitted by older clients; the previously extracted tip is kept so the edit can't silently drop it. */
    readonly tipMilliunits?: number;
    readonly lines: readonly ReceiptExtractLine[];
    /** Omit to keep the extracted reimbursable note; null clears the mark. */
    readonly reimbursable?: { readonly amountMilliunits: number | null } | null;
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
    const tipMilliunits = input.edit.tipMilliunits ?? previous?.tipMilliunits ?? 0;
    const reimbursable = editedReimbursable(previous?.reimbursable, input.edit.reimbursable);
    const gated =
        printedMilliunits != null &&
        arithmeticGate({
            lines: input.edit.lines,
            taxMilliunits: input.edit.taxMilliunits,
            discountMilliunits: input.edit.discountMilliunits,
            tipMilliunits,
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
        tipMilliunits,
        lines: [...input.edit.lines],
        error: null,
        ...(reimbursable ? { reimbursable } : {}),
    };
    return {
        kind: 'applied',
        extractStatus,
        vendor,
        purchaseDate,
        printedMilliunits,
        totalsDisagree: false,
        extractJson: JSON.stringify(payload),
        rawText: formatReceiptExtractDump(
            input.edit.lines,
            input.edit.taxMilliunits,
            input.edit.discountMilliunits,
            tipMilliunits,
        ),
    };
}

/** The reviewer owns the amount; what was written on the paper stays as the audit trail. */
function editedReimbursable(
    previous: ReceiptReimbursableNote | undefined,
    edit: ReceiptExtractEdit['reimbursable'],
): ReceiptReimbursableNote | undefined {
    if (edit === undefined) {
        return previous;
    }
    if (edit === null) {
        return undefined;
    }
    const amount = edit.amountMilliunits;
    return {
        writtenText: previous?.writtenText ?? null,
        amountMilliunits: amount != null && amount > 0 ? amount : null,
    };
}

function emptyToNull(value: string | null): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}
