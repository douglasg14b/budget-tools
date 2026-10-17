import type { ReceiptBoundFilter } from '@budget-tools/web-sdk';

import { parseReceiptExtract } from './parseReceiptExtract';

export type ReceiptsSearchState = {
    q: string | undefined;
    /** Only receipts with a reimbursable note. */
    reimbursable: boolean;
    bound: ReceiptBoundFilter | undefined;
};

/**
 * Reads the receipts inbox filters from the URL. Unknown `bound` values are ignored.
 */
export function parseReceiptsSearchParams(searchParams: URLSearchParams): ReceiptsSearchState {
    const qRaw = searchParams.get('q');
    const boundRaw = searchParams.get('bound');
    return {
        q: qRaw?.trim() ? qRaw : undefined,
        reimbursable: searchParams.get('reimbursable') === '1',
        bound: boundRaw === 'bound' || boundRaw === 'unbound' ? boundRaw : undefined,
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
    return params;
}

export function receiptsFilterCount(state: ReceiptsSearchState): number {
    return (state.q ? 1 : 0) + (state.reimbursable ? 1 : 0) + (state.bound ? 1 : 0);
}

export type ReceiptFilterFields = {
    readonly vendor: string | null;
    readonly purchaseDate: string | null;
    readonly printedMilliunits: number | null;
    readonly rawText: string | null;
    readonly extractJson: string | null;
    readonly transactionId: string | null;
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
