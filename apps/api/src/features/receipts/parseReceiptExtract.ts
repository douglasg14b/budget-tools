import type { ReceiptExtractLine } from './pipeline/arithmeticGate';
import type { ReceiptReimbursableNote } from './pipeline/readReimbursableNote';
import type { HandwrittenTotalsSettlement } from './pipeline/settleHandwrittenTotals';
import type { ReceiptVerifyFlag } from './pipeline/verifyReceiptExtract';

export type ReceiptExtractPayload = {
    readonly repaired: boolean;
    readonly gated: boolean;
    readonly headerPrintedMilliunits: number | null;
    /** Printed total from the line-vision call (legacy key; not local OCR). */
    readonly ocrPrintedMilliunits: number | null;
    readonly taxMilliunits: number;
    readonly discountMilliunits: number;
    /** Printed or handwritten tip. Records written before tips were read parse as 0. */
    readonly tipMilliunits: number;
    readonly lines: ReceiptExtractLine[];
    readonly error: string | null;
    /**
     * Advisory flags from the post-extract decision pass. Absent on records
     * written before the check existed, and on receipts where it failed or was
     * disabled — never treat an empty list as "verified clean".
     */
    readonly verifyFlags?: readonly ReceiptVerifyFlag[];
    /**
     * Audit of the handwritten tip/total pass: what each read saw and how the total was settled.
     * Absent when the pass did not run. Write-only here; parseReceiptExtract does not read it back.
     */
    readonly handwrittenTotals?: HandwrittenTotalsSettlement;
    /**
     * "Reimbursable" is written on the receipt. Absent when it is not, and on records written
     * before the note was read. The amount is the share written beside the word, if any.
     */
    readonly reimbursable?: ReceiptReimbursableNote;
};

/**
 * Parses stored extract JSON. Missing lines become an empty list so a failed extract can still be edited.
 */
export function parseReceiptExtract(extractJson: string | null): ReceiptExtractPayload | null {
    if (!extractJson) {
        return null;
    }
    try {
        const parsed: unknown = JSON.parse(extractJson);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return null;
        }
        const record = parsed as {
            repaired?: unknown;
            gated?: unknown;
            headerPrintedMilliunits?: unknown;
            ocrPrintedMilliunits?: unknown;
            taxMilliunits?: unknown;
            discountMilliunits?: unknown;
            tipMilliunits?: unknown;
            lines?: unknown;
            error?: unknown;
            verifyFlags?: unknown;
            reimbursable?: unknown;
        };
        const verifyFlags = parseVerifyFlags(record.verifyFlags);
        const reimbursable = parseReimbursable(record.reimbursable);
        return {
            ...(verifyFlags ? { verifyFlags } : {}),
            ...(reimbursable ? { reimbursable } : {}),
            repaired: record.repaired === true,
            gated: record.gated === true,
            headerPrintedMilliunits:
                typeof record.headerPrintedMilliunits === 'number' ? record.headerPrintedMilliunits : null,
            ocrPrintedMilliunits: typeof record.ocrPrintedMilliunits === 'number' ? record.ocrPrintedMilliunits : null,
            taxMilliunits: typeof record.taxMilliunits === 'number' ? record.taxMilliunits : 0,
            discountMilliunits: typeof record.discountMilliunits === 'number' ? record.discountMilliunits : 0,
            tipMilliunits: typeof record.tipMilliunits === 'number' ? record.tipMilliunits : 0,
            lines: parseLines(record.lines),
            error: typeof record.error === 'string' ? record.error : null,
        };
    } catch {
        return null;
    }
}

export function formatReceiptExtractDump(
    lines: readonly ReceiptExtractLine[],
    taxMilliunits: number,
    discountMilliunits: number,
    tipMilliunits: number,
): string | null {
    const rows: string[] = lines.map((line) => {
        if (line.amountMilliunits == null) {
            return line.name;
        }
        return `${line.name} ${(line.amountMilliunits / 1000).toFixed(2)}`;
    });
    if (taxMilliunits !== 0) {
        rows.push(`Tax ${(taxMilliunits / 1000).toFixed(2)}`);
    }
    if (discountMilliunits !== 0) {
        rows.push(`Discount ${(discountMilliunits / 1000).toFixed(2)}`);
    }
    if (tipMilliunits !== 0) {
        rows.push(`Tip ${(tipMilliunits / 1000).toFixed(2)}`);
    }
    return rows.length > 0 ? rows.join('\n') : null;
}

const VERIFY_FLAGS: readonly ReceiptVerifyFlag[] = ['vendor-suspect', 'discount-double-counted'];

/** Undefined (not []) when the key is absent, so "unchecked" stays distinct from "checked, clean". */
function parseVerifyFlags(value: unknown): readonly ReceiptVerifyFlag[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }
    return value.filter((flag): flag is ReceiptVerifyFlag => VERIFY_FLAGS.includes(flag as ReceiptVerifyFlag));
}

function parseReimbursable(value: unknown): ReceiptReimbursableNote | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }
    const note = value as { writtenText?: unknown; amountMilliunits?: unknown };
    return {
        writtenText: typeof note.writtenText === 'string' ? note.writtenText : null,
        amountMilliunits:
            typeof note.amountMilliunits === 'number' && note.amountMilliunits > 0 ? note.amountMilliunits : null,
    };
}

function parseLines(value: unknown): ReceiptExtractLine[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const lines: ReceiptExtractLine[] = [];
    for (const row of value) {
        if (!row || typeof row !== 'object') {
            continue;
        }
        const line = row as { name?: unknown; amountMilliunits?: unknown; quantity?: unknown };
        if (typeof line.name !== 'string') {
            continue;
        }
        lines.push({
            name: line.name,
            amountMilliunits: typeof line.amountMilliunits === 'number' ? line.amountMilliunits : null,
            quantity: typeof line.quantity === 'number' ? line.quantity : null,
        });
    }
    return lines;
}
