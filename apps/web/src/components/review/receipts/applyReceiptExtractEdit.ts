import type { ReceiptExtractStatus } from '@budget-tools/web-sdk';

import { isAmazonTransaction } from '../classify/isAmazonTransaction';
import type { PracticeReceipt } from '../classify/practiceReceipts';
import type { ReceiptExtractLine } from './parseReceiptExtract';
import { parseReceiptExtract } from './parseReceiptExtract';

export const AMAZON_RECEIPT_EDIT_MESSAGE = 'Amazon receipts are not stored in this inbox';

export type ReceiptExtractEdit = {
    readonly vendor: string | null;
    readonly purchaseDate: string | null;
    readonly printedMilliunits: number | null;
    readonly taxMilliunits: number;
    readonly discountMilliunits: number;
    readonly lines: readonly ReceiptExtractLine[];
};

export type AppliedReceiptExtractEdit = {
    readonly vendor: string | null;
    readonly purchaseDate: string | null;
    readonly printedMilliunits: number | null;
    readonly extractStatus: ReceiptExtractStatus;
    readonly totalsDisagree: false;
    readonly extractJson: string;
    readonly rawText: string | null;
};

/**
 * Practice-session rebuild of extract JSON and status. Live uses PATCH instead.
 */
export function applyReceiptExtractEdit(input: {
    readonly previousExtractJson: string | null;
    readonly edit: ReceiptExtractEdit;
}): AppliedReceiptExtractEdit {
    const vendor = emptyToNull(input.edit.vendor);
    if (
        isAmazonTransaction({
            payeeName: vendor,
            importPayeeName: null,
            importPayeeNameOriginal: null,
        })
    ) {
        throw new Error(AMAZON_RECEIPT_EDIT_MESSAGE);
    }
    const purchaseDate = emptyToNull(input.edit.purchaseDate);
    const printedMilliunits = input.edit.printedMilliunits;
    const previous = parseReceiptExtract(input.previousExtractJson);
    const gated = printedMatchesLines(input.edit);
    const hasKeys = Boolean(vendor && purchaseDate && printedMilliunits != null);
    const extractStatus: ReceiptExtractStatus = !hasKeys ? 'failed' : gated ? 'gated' : 'ungated';
    return {
        vendor,
        purchaseDate,
        printedMilliunits,
        extractStatus,
        totalsDisagree: false,
        extractJson: JSON.stringify({
            repaired: previous?.repaired ?? false,
            gated,
            headerPrintedMilliunits: previous?.headerPrintedMilliunits ?? null,
            ocrPrintedMilliunits: previous?.ocrPrintedMilliunits ?? null,
            taxMilliunits: input.edit.taxMilliunits,
            discountMilliunits: input.edit.discountMilliunits,
            lines: [...input.edit.lines],
            error: null,
        }),
        rawText: formatDump(input.edit),
    };
}

export function applyPracticeReceiptExtractEdit(
    receipts: readonly PracticeReceipt[],
    receiptId: string,
    edit: ReceiptExtractEdit,
): PracticeReceipt[] {
    return receipts.map((receipt) => {
        if (receipt.id !== receiptId) {
            return receipt;
        }
        const applied = applyReceiptExtractEdit({ previousExtractJson: receipt.extractJson, edit });
        return { ...receipt, ...applied };
    });
}

function printedMatchesLines(edit: ReceiptExtractEdit): boolean {
    if (edit.printedMilliunits == null) {
        return false;
    }
    let sum = edit.taxMilliunits - edit.discountMilliunits;
    for (const line of edit.lines) {
        if (line.amountMilliunits == null) {
            return false;
        }
        sum += line.amountMilliunits;
    }
    return sum === edit.printedMilliunits;
}

function formatDump(edit: ReceiptExtractEdit): string | null {
    const rows: string[] = edit.lines.map((line) => {
        if (line.amountMilliunits == null) {
            return line.name;
        }
        return `${line.name} ${(line.amountMilliunits / 1000).toFixed(2)}`;
    });
    if (edit.taxMilliunits !== 0) {
        rows.push(`Tax ${(edit.taxMilliunits / 1000).toFixed(2)}`);
    }
    if (edit.discountMilliunits !== 0) {
        rows.push(`Discount ${(edit.discountMilliunits / 1000).toFixed(2)}`);
    }
    return rows.length > 0 ? rows.join('\n') : null;
}

function emptyToNull(value: string | null): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}
