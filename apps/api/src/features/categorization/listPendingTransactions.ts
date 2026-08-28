import { sql } from 'kysely';

import { getDatabase } from '../../data/database';
import { reconcileClassificationSync } from '../ynabSync/reconcileClassificationSync';
import { scoringFingerprint } from './cache/proposalFingerprint';
import type { TransactionDetailDto } from './categorizationDtos';
import { formatTransactionDate, mapTransactionDetail, TRANSACTION_DETAIL_COLUMNS } from './mapTransactionDetail';

export type PendingTransactionRow = TransactionDetailDto & {
    readonly fingerprint: string;
};

/**
 * Pending review-queue transactions, newest first.
 * Matches `TransactionQueries.GetPendingTransactions` in categorization-ai.
 * Uncleared rows are omitted so they cannot be approved here and confuse bank-matching.
 */
export async function listPendingTransactions(): Promise<PendingTransactionRow[]> {
    const rows = await getDatabase()
        .selectFrom('transactions')
        .select([...TRANSACTION_DETAIL_COLUMNS])
        .where('deleted', '=', false)
        .where('transfer_account_id', 'is', null)
        .where('cleared', 'in', ['cleared', 'reconciled'])
        .where(sql<boolean>`jsonb_typeof(subtransactions) = 'array' and jsonb_array_length(subtransactions) = 0`)
        .where((builder) =>
            builder.or([
                builder('approved', '=', false),
                builder('category_id', 'is', null),
                sql<boolean>`coalesce(btrim(category_name), '') = ''`,
                sql<boolean>`lower(category_name) = 'uncategorized'`,
                sql<boolean>`lower(category_name) like 'inflow:%'`,
            ]),
        )
        .orderBy('date', 'desc')
        .orderBy('id', 'asc')
        .execute();

    const mapped = rows.map((row) => {
        const detail = mapTransactionDetail(row);
        return {
            ...detail,
            fingerprint: scoringFingerprint({
                importPayeeNameOriginal: row.import_payee_name_original,
                importPayeeName: row.import_payee_name,
                payeeName: row.payee_name,
                payeeId: row.payee_id,
                amount: row.amount,
                accountName: row.account_name,
                memo: row.memo,
                date: formatTransactionDate(row.date),
            }),
        };
    });
    const excluded = await reconcileClassificationSync(mapped.map((row) => row.id));
    return mapped.filter((row) => !excluded.has(row.id));
}

export function toTransactionDetail(row: PendingTransactionRow): TransactionDetailDto {
    return {
        id: row.id,
        date: row.date,
        amount: row.amount,
        memo: row.memo,
        cleared: row.cleared,
        approved: row.approved,
        accountId: row.accountId,
        accountName: row.accountName,
        payeeId: row.payeeId,
        payeeName: row.payeeName,
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        importId: row.importId,
        importPayeeName: row.importPayeeName,
        importPayeeNameOriginal: row.importPayeeNameOriginal,
    };
}
