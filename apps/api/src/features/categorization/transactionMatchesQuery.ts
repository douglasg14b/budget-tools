export type TransactionQueryFields = {
    readonly date: string;
    readonly amount: number;
    readonly memo: string | null;
    readonly accountName: string;
    readonly payeeName: string | null;
    readonly categoryName: string | null;
    readonly importPayeeName: string | null;
    readonly importPayeeNameOriginal: string | null;
};

/**
 * True when every whitespace-separated term is a case-insensitive substring of
 * payee, import names, memo, category, account, date, or formatted amount.
 * Blank queries match everything.
 */
export function transactionMatchesQuery(transaction: TransactionQueryFields, query: string | undefined): boolean {
    const terms = queryTerms(query);
    if (terms.length === 0) {
        return true;
    }

    const haystack = transactionQueryHaystack(transaction);
    return terms.every((term) => haystack.includes(term));
}

function queryTerms(query: string | undefined): string[] {
    if (!query?.trim()) {
        return [];
    }

    return query.trim().toLowerCase().split(/\s+/);
}

function transactionQueryHaystack(transaction: TransactionQueryFields): string {
    const dollars = (transaction.amount / 1000).toFixed(2);
    const absDollars = Math.abs(transaction.amount / 1000).toFixed(2);
    return [
        transaction.payeeName,
        transaction.importPayeeName,
        transaction.importPayeeNameOriginal,
        transaction.memo,
        transaction.categoryName,
        transaction.accountName,
        transaction.date,
        dollars,
        absDollars,
        `$${absDollars}`,
        `-$${absDollars}`,
    ]
        .filter((part): part is string => Boolean(part))
        .join('\n')
        .toLowerCase();
}
