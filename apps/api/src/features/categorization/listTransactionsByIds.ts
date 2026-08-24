import { getDatabase } from '../../data/database';
import type { TransactionDetailDto } from './categorizationDtos';
import { mapTransactionDetail, TRANSACTION_DETAIL_COLUMNS } from './mapTransactionDetail';

/**
 * Local ledger rows for the given YNAB transaction ids, excluding deleted.
 * Result order matches `ids`, omitting anything not found.
 */
export async function listTransactionsByIds(ids: readonly string[]): Promise<TransactionDetailDto[]> {
    if (ids.length === 0) {
        return [];
    }

    const uniqueIds = [...new Set(ids)];
    const rows = await getDatabase()
        .selectFrom('transactions')
        .select([...TRANSACTION_DETAIL_COLUMNS])
        .where('deleted', '=', false)
        .where('id', 'in', uniqueIds)
        .execute();

    const byId = new Map(rows.map((row) => [row.id, mapTransactionDetail(row)]));
    return ids.flatMap((id) => {
        const transaction = byId.get(id);
        return transaction ? [transaction] : [];
    });
}
