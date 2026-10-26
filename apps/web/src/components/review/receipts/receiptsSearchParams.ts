import type { ReceiptBoundFilter, ReceiptIssueFilter } from '@budget-tools/web-sdk';

import { parseReceiptExtract } from './parseReceiptExtract';
import type { ReceiptIssueFields } from './receiptIssues';
import { isReceiptIssueFilter, receiptHasIssue } from './receiptIssues';

export type ReceiptsSearchState = {
    q: string | undefined;
    /** Only receipts with a reimbursable note. */
    reimbursable: boolean;
    bound: ReceiptBoundFilter | undefined;
    issue: ReceiptIssueFilter | undefined;
};

/**
 * Reads the receipts inbox filters from the URL. Unknown `bound` and `issue` values are ignored.
 */
export function parseReceiptsSearchParams(searchParams: URLSearchParams): ReceiptsSearchState {
    const qRaw = searchParams.get('q');
    const boundRaw = searchParams.get('bound');
    const issueRaw = searchParams.get('issue');
    return {
        q: qRaw?.trim() ? qRaw : undefined,
        reimbursable: searchParams.get('reimbursable') === '1',
        bound: boundRaw === 'bound' || boundRaw === 'unbound' ? boundRaw : undefined,
        issue: isReceiptIssueFilter(issueRaw) ? issueRaw : undefined,
    };
}

/**
 * Writes the receipts inbox filters to URL search params. Omitted values mean "all".
 */
export function serializeReceiptsSearchParams(state: ReceiptsSearchState): URLSearchParams {
    const params = new URLSearchParams();
    if (state.q) {
        params.set('q', state.q);
    }
    if (state.reimbursable) {
        params.set('reimbursable', '1');
    }
    if (state.bound) {
        params.set('bound', state.bound);
    }
    if (state.issue) {
        params.set('issue', state.issue);
    }
    return params;
}

export function receiptsFilterCount(state: ReceiptsSearchState): number {
    return (state.q ? 1 : 0) + (state.reimbursable ? 1 : 0) + (state.bound ? 1 : 0) + (state.issue ? 1 : 0);
}

export type ReceiptFilterFields = ReceiptIssueFields & {
    readonly vendor: string | null;
    readonly purchaseDate: string | null;
    readonly printedMilliunits: number | null;
    readonly rawText: string | null;
};

/**
 * Practice receipts never reach the server, so they are filtered here. Mirrors the API's
 * `receiptMatchesFilter`: every search term is a case-insensitive substring of vendor, date,
 * total, extracted lines, or the reimbursable note.
 */
export function receiptMatchesSearch(receipt: ReceiptFilterFields, search: ReceiptsSearchState): boolean {
    if (search.bound === 'bound' && !receipt.transactionId) {
        return false;
    }
    if (search.bound === 'unbound' && receipt.transactionId) {
        return false;
    }
    if (search.issue && !receiptHasIssue(receipt, search.issue)) {
        return false;
    }
    const terms = search.q?.trim() ? search.q.trim().toLowerCase().split(/\s+/) : [];
    if (!search.reimbursable && terms.length === 0) {
        return true;
    }
    const reimbursable = parseReceiptExtract(receipt.extractJson)?.reimbursable;
    if (search.reimbursable && !reimbursable) {
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

function amountForms(milliunits: number | null): string[] {
    if (milliunits == null) {
        return [];
    }
    const dollars = Math.abs(milliunits / 1000).toFixed(2);
    return [dollars, `$${dollars}`];
}
