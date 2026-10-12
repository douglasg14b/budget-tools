import { alignAmountToBank } from '../amazonClassify/alignAmountToBank';
import type { ReceiptExtractStatus } from './data/receiptsSchema';
import { equalShareBankMilliunits } from './equalShareBankMilliunits';
import { parseReceiptExtract } from './parseReceiptExtract';
import type { ReceiptExtractLine } from './pipeline/arithmeticGate';
import type { ReceiptSplitDraftCategoryDto, ReceiptSplitDraftDto } from './receiptsDtos';

export type SeedReceiptSplitDraftInput = {
    readonly extractStatus: ReceiptExtractStatus | null;
    readonly totalsDisagree: boolean;
    readonly bankMilliunits: number;
    readonly extractJson: string | null;
    /** Where a reimbursable share goes; null when the catalog has no such category. */
    readonly reimbursableCategory: ReceiptSplitDraftCategoryDto | null;
};

type ParsedExtract = {
    readonly taxMilliunits: number;
    readonly discountMilliunits: number;
    readonly tipMilliunits: number;
    readonly lines: ReceiptExtractLine[];
};

/**
 * A written reimbursable amount wins: its share goes to the reimbursable category and the rest
 * stays for the reviewer. Otherwise gated line amounts may own cents only when they already sum
 * to the bank charge, and names get equal shares of the bank. One name is not a fake split.
 */
export function seedReceiptSplitDraft(input: SeedReceiptSplitDraftInput): ReceiptSplitDraftDto | null {
    const parsed = parseReceiptExtract(input.extractJson);
    const reimbursable = reimbursableSplitDraft(
        parsed?.reimbursable?.amountMilliunits ?? null,
        input.bankMilliunits,
        input.reimbursableCategory,
    );
    if (reimbursable) {
        return reimbursable;
    }
    if (input.extractStatus !== 'gated' && input.extractStatus !== 'ungated') {
        return null;
    }
    if (input.totalsDisagree) {
        return null;
    }
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

/**
 * The written share needs no extract gate — it is checked against the bank charge itself. A share
 * larger than the charge cannot be right, so it seeds nothing and the mark alone stays visible.
 */
function reimbursableSplitDraft(
    amountMilliunits: number | null,
    bankMilliunits: number,
    category: ReceiptSplitDraftCategoryDto | null,
): ReceiptSplitDraftDto | null {
    if (amountMilliunits == null || !category || bankMilliunits === 0) {
        return null;
    }
    const share = alignAmountToBank(amountMilliunits, bankMilliunits);
    if (Math.abs(share) > Math.abs(bankMilliunits)) {
        return null;
    }
    const shareLine = { amountMilliunits: share, memo: null, category };
    if (share === bankMilliunits) {
        return { kind: 'single', lines: [shareLine] };
    }
    return { kind: 'split', lines: [shareLine, { amountMilliunits: bankMilliunits - share, memo: null }] };
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
    if (parsed.tipMilliunits !== 0) {
        rows.push({
            amountMilliunits: alignAmountToBank(parsed.tipMilliunits, bankMilliunits),
            memo: 'Tip',
        });
    }
    const sum = rows.reduce((total, row) => total + row.amountMilliunits, 0);
    if (sum !== bankMilliunits) {
        return null;
    }
    return rows;
}
