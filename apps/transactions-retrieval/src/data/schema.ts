import type { ColumnType, Generated, Insertable, JSONColumnType, Selectable, Updateable } from 'kysely';
import type { TransactionClearedStatus, TransactionDetailDebtTransactionTypeEnum, TransactionFlagColor } from 'ynab';

export interface Database {
    tracking: StateTrackingTable;
    transactions: YnabTransactionTable;
    category_groups: CategoryGroupTable;
    categories: CategoryTable;
    metrics: MetricsTable;
}

export type MetricTableMeta = {
    account_id: string | null;
    account_name: string;
};

export type MetricsTable = {
    id: Generated<number>;
    date: ColumnType<Date, string>;
    name: 'unapproved' | 'uncategorized';
    value: number;
    meta: JSONColumnType<MetricTableMeta, MetricTableMeta, MetricTableMeta>;
};

export type Metric = Selectable<MetricsTable>;
export type NewMetric = Insertable<MetricsTable>;

type CachedBudgetValue = {
    id: string;
    name: string;
};

// Single row table
export type StateTrackingTable = {
    id: Generated<number>;
    last_pulled_date: ColumnType<Date, string | null>;

    /** YNAB delta request tracking. Used for the getTransactions call. */
    last_server_knowledge: number | null;

    /** UNUSED. The cached budget to save on 200/h API rate limits */
    cache_budget: JSONColumnType<CachedBudgetValue, CachedBudgetValue, CachedBudgetValue> | null;
};

export type StateTracking = Selectable<StateTrackingTable>;
export type NewStateTracking = Insertable<StateTrackingTable>;
export type StateTrackingUpdate = Updateable<StateTrackingTable>;

export type SubTransactionSchema = {
    id: string;
    transaction_id: string;
    amount: number;
    memo: string | null;
    payee_id: string | null;
    payee_name: string | null;
    category_id: string | null;
    category_name: string | null;
    transfer_account_id: string | null;
    transfer_transaction_id: string | null;
    deleted: boolean;
};

type TransactionMeta = {
    first_seen_date: string;
    first_cleared_date: string | null;
    first_approved_date: string | null;
    first_categorized_date: string | null;
};

export type YnabTransactionTable = {
    id: string;
    date: ColumnType<Date, string>;
    amount: number;
    memo: string | null;
    cleared: TransactionClearedStatus;
    approved: boolean;
    flag_color: TransactionFlagColor | null;
    flag_name: string | null;
    account_id: string;
    payee_id: string | null;
    category_id: string | null;
    transfer_account_id: string | null;
    transfer_transaction_id: string | null;
    matched_transaction_id: string | null;
    import_id: string | null;
    import_payee_name: string | null;
    import_payee_name_original: string | null;
    debt_transaction_type: TransactionDetailDebtTransactionTypeEnum | null;
    deleted: boolean;
    account_name: string;
    payee_name: string | null;
    category_name: string | null;
    subtransactions: JSONColumnType<SubTransactionSchema[]>;

    meta: JSONColumnType<TransactionMeta, TransactionMeta, TransactionMeta>;
};

export type Transaction = Selectable<YnabTransactionTable>;
export type NewTransaction = Insertable<YnabTransactionTable>;
export type TransactionUpdate = Updateable<YnabTransactionTable>;

export type CategoryGroupTable = {
    id: string;
    name: string;
    hidden: boolean;
    deleted: boolean;
};

export type CategoryTable = {
    id: string;
    category_group_id: string;
    name: string;
    hidden: boolean;
    deleted: boolean;
    note: string | null;
};

export type CategoryGroup = Selectable<CategoryGroupTable>;
export type NewCategoryGroup = Insertable<CategoryGroupTable>;
export type CategoryGroupUpdate = Updateable<CategoryGroupTable>;

export type Category = Selectable<CategoryTable>;
export type NewCategory = Insertable<CategoryTable>;
export type CategoryUpdate = Updateable<CategoryTable>;
