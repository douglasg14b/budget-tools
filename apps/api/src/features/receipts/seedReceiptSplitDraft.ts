import { alignAmountToBank } from '../amazonClassify/alignAmountToBank';
import type { ReceiptExtractStatus } from './data/receiptsSchema';
import { equalShareBankMilliunits } from './equalShareBankMilliunits';
import { parseReceiptExtract } from './parseReceiptExtract';
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
    const parsed = parseReceiptExtract(input.extractJson);
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
