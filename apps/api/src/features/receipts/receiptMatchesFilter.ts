import { parseReceiptExtract } from './parseReceiptExtract';
import type { ReceiptIssueFields, ReceiptIssueFilter } from './receiptIssues';
import { receiptHasIssue } from './receiptIssues';

export type ReceiptBoundFilter = 'bound' | 'unbound';

export type ReceiptListFilter = {
    readonly q?: string;
    /** Only receipts with a reimbursable note. */
    readonly reimbursable?: boolean;
    readonly bound?: ReceiptBoundFilter;
    readonly issue?: ReceiptIssueFilter;
};

export type ReceiptFilterFields = ReceiptIssueFields & {
    readonly vendor: string | null;
    readonly purchaseDate: string | null;
    readonly printedMilliunits: number | null;
    readonly rawText: string | null;
};

export function receiptFilterActive(filter: ReceiptListFilter): boolean {
    return (
        Boolean(filter.q?.trim()) ||
        filter.reimbursable === true ||
        filter.bound !== undefined ||
        filter.issue !== undefined
    );
}

/**
 * True when the receipt passes every chip, has the chosen issue (see `receiptIssues`), and every whitespace-separated search term is a
 * case-insensitive substring of vendor, date, total, extracted lines, or the reimbursable note.
 * Reimbursable means what the inbox badge shows: the extract carries a reimbursable note.
 */
export function receiptMatchesFilter(receipt: ReceiptFilterFields, filter: ReceiptListFilter): boolean {
    if (filter.bound === 'bound' && !receipt.transactionId) {
        return false;
    }
    if (filter.bound === 'unbound' && receipt.transactionId) {
        return false;
    }
    if (filter.issue && !receiptHasIssue(receipt, filter.issue)) {
        return false;
    }
    const terms = queryTerms(filter.q);
    if (!filter.reimbursable && terms.length === 0) {
        return true;
    }
    const reimbursable = parseReceiptExtract(receipt.extractJson)?.reimbursable;
    if (filter.reimbursable && !reimbursable) {
        return false;
    }
    if (terms.length === 0) {
        return true;
    }
    const haystack = [
        receipt.vendor,
        receipt.purchaseDate,
        receipt.rawText,
        ...amountForms(receipt.printedMilliunits),
        ...(reimbursable
            ? ['reimbursable', reimbursable.writtenText, ...amountForms(reimbursable.amountMilliunits)]
            : []),
    ]
        .filter((part): part is string => Boolean(part))
        .join('\n')
        .toLowerCase();
    return terms.every((term) => haystack.includes(term));
}

function queryTerms(query: string | undefined): string[] {
    if (!query?.trim()) {
        return [];
    }
    return query.trim().toLowerCase().split(/\s+/);
}

function amountForms(milliunits: number | null): string[] {
    if (milliunits == null) {
        return [];
    }
    const dollars = Math.abs(milliunits / 1000).toFixed(2);
    return [dollars, `$${dollars}`];
}
