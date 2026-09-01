import { alignAmountToBank } from '../amazonClassify/alignAmountToBank';
import type { ReceiptExtractStatus } from './data/receiptsSchema';
import { equalShareBankMilliunits } from './equalShareBankMilliunits';
import type { ReceiptExtractLine } from './pipeline/arithmeticGate';
import type { ReceiptSplitDraftDto } from './receiptsDtos';

export type SeedReceiptSplitDraftInput = {
    readonly extractStatus: ReceiptExtractStatus | null;
    readonly totalsDisagree: boolean;
    readonly bankMilliunits: number;
    readonly extractJson: string | null;
};

type ParsedExtract = {
    readonly taxMilliunits: number;
    readonly discountMilliunits: number;
    readonly lines: ReceiptExtractLine[];
};

/**
 * Gated line amounts may own cents only when they already sum to the bank charge.
 * Otherwise names get equal shares of the bank. One name is not a fake split.
 */
export function seedReceiptSplitDraft(input: SeedReceiptSplitDraftInput): ReceiptSplitDraftDto | null {
    if (input.extractStatus !== 'gated' && input.extractStatus !== 'ungated') {
        return null;
    }
    if (input.totalsDisagree) {
        return null;
    }
    const parsed = parseExtractPayload(input.extractJson);
    if (!parsed) {
        return null;
    }
    const namedLines = parsed.lines.filter((line) => line.name.trim());
    if (namedLines.length === 0) {
        return null;
    }

    const gatedLines = gatedSplitLines(namedLines, parsed, input.bankMilliunits);
    const amounts =
        input.extractStatus === 'gated' && gatedLines
            ? gatedLines
            : equalShareBankMilliunits(input.bankMilliunits, namedLines.length).map((amount, index) => ({
                  amountMilliunits: amount,
                  memo: namedLines[index]?.name ?? null,
              }));

    if (amounts.length <= 1) {
        return { kind: 'single', lines: amounts };
    }
    return { kind: 'split', lines: amounts };
}

function gatedSplitLines(
    namedLines: readonly ReceiptExtractLine[],
    parsed: ParsedExtract,
    bankMilliunits: number,
): ReceiptSplitDraftDto['lines'] | null {
    if (namedLines.some((line) => line.amountMilliunits == null)) {
        return null;
    }
    const items = namedLines.map((line) => ({
        amountMilliunits: alignAmountToBank(line.amountMilliunits ?? 0, bankMilliunits),
        memo: line.name,
    }));
    const rows = [...items];
    if (parsed.taxMilliunits !== 0) {
        rows.push({
            amountMilliunits: alignAmountToBank(parsed.taxMilliunits, bankMilliunits),
            memo: 'Tax',
        });
    }
    if (parsed.discountMilliunits !== 0) {
        rows.push({
            amountMilliunits: -alignAmountToBank(parsed.discountMilliunits, bankMilliunits),
            memo: 'Discount',
        });
    }
    const sum = rows.reduce((total, row) => total + row.amountMilliunits, 0);
    if (sum !== bankMilliunits) {
        return null;
    }
    return rows;
}

function parseExtractPayload(extractJson: string | null): ParsedExtract | null {
    if (!extractJson) {
        return null;
    }
    try {
        const parsed: unknown = JSON.parse(extractJson);
        if (!parsed || typeof parsed !== 'object') {
            return null;
        }
        const record = parsed as {
            taxMilliunits?: unknown;
            discountMilliunits?: unknown;
            lines?: unknown;
        };
        if (!Array.isArray(record.lines)) {
            return null;
        }
        const lines: ReceiptExtractLine[] = [];
        for (const row of record.lines) {
            if (!row || typeof row !== 'object') {
                return null;
            }
            const line = row as { name?: unknown; amountMilliunits?: unknown; quantity?: unknown };
            if (typeof line.name !== 'string') {
                return null;
            }
            lines.push({
                name: line.name,
                amountMilliunits: typeof line.amountMilliunits === 'number' ? line.amountMilliunits : null,
                quantity: typeof line.quantity === 'number' ? line.quantity : null,
            });
        }
        return {
            taxMilliunits: typeof record.taxMilliunits === 'number' ? record.taxMilliunits : 0,
            discountMilliunits: typeof record.discountMilliunits === 'number' ? record.discountMilliunits : 0,
            lines,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn('receipt extract JSON could not be parsed for split draft', message);
        return null;
    }
}
