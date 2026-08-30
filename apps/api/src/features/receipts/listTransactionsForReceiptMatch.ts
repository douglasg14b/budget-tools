import type { DatabaseClient } from '@budget-tools/db';
import { sql } from 'kysely';

import { getDatabase } from '../../data/database';
import { isAmazonTransaction } from '../amazonClassify/isAmazonTransaction';
import type { TransactionDetailDto } from '../categorization/categorizationDtos';
import { mapTransactionDetail, TRANSACTION_DETAIL_COLUMNS } from '../categorization/mapTransactionDetail';
import type { IsoDateWindow } from './paymentDateWindow';
import { bankDateWindowForPurchaseDate } from './paymentDateWindow';

export const RECEIPT_MATCH_CLEARED_STATUSES = ['cleared', 'reconciled'] as const;

export type ReceiptMatchTransactionCriteria = {
    readonly deleted: false;
    readonly transferAccountId: null;
    readonly cleared: typeof RECEIPT_MATCH_CLEARED_STATUSES;
    readonly window: IsoDateWindow;
};

/**
 * Same deleted / non-transfer / cleared filters as pending queue listing, plus the inverted
 * purchase-date window. Household matching is intentionally cross-account: receipt rows have
 * no YNAB account id.
 */
export function receiptMatchTransactionCriteria(purchaseDate: string): ReceiptMatchTransactionCriteria {
    return {
        deleted: false,
        transferAccountId: null,
        cleared: RECEIPT_MATCH_CLEARED_STATUSES,
        window: bankDateWindowForPurchaseDate(purchaseDate),
    };
}

/**
 * Drop Amazon payees after the date-window query. Used by receipt→transaction lookup.
 */
export function excludeAmazonTransactions(transactions: readonly TransactionDetailDto[]): TransactionDetailDto[] {
    return transactions.filter((transaction) => !isAmazonTransaction(transaction));
}

/**
 * Cleared non-transfer ledger rows in the receipt's inverted bank window, including already categorized.
 * Does not use the pending-only queue filter.
 */
export async function listTransactionsForReceiptMatch(
    purchaseDate: string,
    database: DatabaseClient = getDatabase(),
): Promise<TransactionDetailDto[]> {
    const criteria = receiptMatchTransactionCriteria(purchaseDate);
    const rows = await database
        .selectFrom('transactions')
        .select([...TRANSACTION_DETAIL_COLUMNS])
        .where('deleted', '=', criteria.deleted)
        .where('transfer_account_id', 'is', criteria.transferAccountId)
        .where('cleared', 'in', [...criteria.cleared])
        .where(sql<boolean>`date::date >= ${criteria.window.earliestDate}::date`)
        .where(sql<boolean>`date::date <= ${criteria.window.latestDate}::date`)
        .orderBy('date', 'desc')
        .orderBy('id', 'asc')
        .execute();
    return excludeAmazonTransactions(rows.map(mapTransactionDetail));
}
