import type { ReceiptExtractLine } from './pipeline/arithmeticGate';

export type ReceiptExtractPayload = {
    readonly repaired: boolean;
    readonly gated: boolean;
    readonly headerPrintedMilliunits: number | null;
    /** Printed total from the line-vision call (legacy key; not local OCR). */
    readonly ocrPrintedMilliunits: number | null;
    readonly taxMilliunits: number;
    readonly discountMilliunits: number;
    readonly lines: ReceiptExtractLine[];
    readonly error: string | null;
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
            lines?: unknown;
            error?: unknown;
        };
        return {
            repaired: record.repaired === true,
            gated: record.gated === true,
            headerPrintedMilliunits:
                typeof record.headerPrintedMilliunits === 'number' ? record.headerPrintedMilliunits : null,
            ocrPrintedMilliunits: typeof record.ocrPrintedMilliunits === 'number' ? record.ocrPrintedMilliunits : null,
            taxMilliunits: typeof record.taxMilliunits === 'number' ? record.taxMilliunits : 0,
            discountMilliunits: typeof record.discountMilliunits === 'number' ? record.discountMilliunits : 0,
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
    return rows.length > 0 ? rows.join('\n') : null;
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
