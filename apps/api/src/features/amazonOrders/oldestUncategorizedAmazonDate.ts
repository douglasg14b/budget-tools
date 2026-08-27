import { isAmazonTransaction } from '../amazonClassify/isAmazonTransaction';
import { listPendingTransactions } from '../categorization/listPendingTransactions';

export type AmazonBankDateFields = {
    readonly date: string;
    readonly payeeName: string | null;
    readonly importPayeeName: string | null;
    readonly importPayeeNameOriginal: string | null;
};

/** Oldest bank date among uncategorized Amazon charges, or null when the queue has none. */
export function oldestAmazonBankDate(transactions: readonly AmazonBankDateFields[]): string | null {
    let oldest: string | null = null;
    for (const transaction of transactions) {
        if (!isAmazonTransaction(transaction)) {
            continue;
        }
        if (!oldest || transaction.date < oldest) {
            oldest = transaction.date;
        }
    }
    return oldest;
}

export async function oldestUncategorizedAmazonDate(): Promise<string | null> {
    return oldestAmazonBankDate(await listPendingTransactions());
}
