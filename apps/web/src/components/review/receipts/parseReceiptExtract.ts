export type ReceiptExtractLine = {
    readonly name: string;
    readonly amountMilliunits: number | null;
    readonly quantity: number | null;
};

export type ParsedReceiptExtract = {
    readonly repaired: boolean;
    readonly gated: boolean;
    readonly headerPrintedMilliunits: number | null;
    readonly ocrPrintedMilliunits: number | null;
    readonly taxMilliunits: number;
    readonly discountMilliunits: number;
    readonly lines: readonly ReceiptExtractLine[];
    readonly error: string | null;
};

/**
 * Parses stored extract JSON. Missing lines become an empty list so a failed extract can still be shown.
 */
export function parseReceiptExtract(extractJson: string | null): ParsedReceiptExtract | null {
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
