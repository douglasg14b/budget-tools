import type { YnabFlagColor } from '../ynabSync/ynabFlagColor';
import type { TransactionClearedStatus, TransactionDetailDto } from './categorizationDtos';

export const TRANSACTION_DETAIL_COLUMNS = [
    'id',
    'date',
    'amount',
    'memo',
    'cleared',
    'approved',
    'flag_color',
    'flag_name',
    'account_id',
    'account_name',
    'payee_id',
    'payee_name',
    'category_id',
    'category_name',
    'import_id',
    'import_payee_name',
    'import_payee_name_original',
] as const;

export type TransactionDetailRow = {
    id: string;
    date: Date | string;
    amount: number;
    memo: string | null;
    cleared: string;
    approved: boolean;
    flag_color: YnabFlagColor | null;
    flag_name: string | null;
    account_id: string;
    account_name: string;
    payee_id: string | null;
    payee_name: string | null;
    category_id: string | null;
    category_name: string | null;
    import_id: string | null;
    import_payee_name: string | null;
    import_payee_name_original: string | null;
};

export function mapTransactionDetail(row: TransactionDetailRow): TransactionDetailDto {
    return {
        id: row.id,
        date: formatTransactionDate(row.date),
        amount: row.amount,
        memo: row.memo,
        cleared: parseTransactionClearedStatus(row.cleared),
        approved: row.approved,
        flagColor: row.flag_color,
        flagName: row.flag_name,
        accountId: row.account_id,
        accountName: row.account_name,
        payeeId: row.payee_id,
        payeeName: row.payee_name,
        categoryId: row.category_id,
        categoryName: row.category_name,
        importId: row.import_id,
        importPayeeName: row.import_payee_name,
        importPayeeNameOriginal: row.import_payee_name_original,
    };
}

export function parseTransactionClearedStatus(value: string): TransactionClearedStatus {
    if (value === 'uncleared' || value === 'cleared' || value === 'reconciled') {
        return value;
    }
    throw new Error(`Unexpected YNAB cleared status '${value}'`);
}

export function formatTransactionDate(value: Date | string): string {
    if (typeof value === 'string') {
        return value.slice(0, 10);
    }
    return value.toISOString().slice(0, 10);
}
