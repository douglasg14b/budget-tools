import type { SaveTransactionWithIdOrImportId } from 'ynab';
import { API } from 'ynab';

import { getYnabApiKey, getYnabBudgetName } from '../../../environment';
import { HttpError } from '../../travelWindows/HttpError';
import type { YnabPatchTransaction } from '../buildYnabPatch';
import { YnabRateLimitError, ynabErrorMessage, ynabRetryAfterMs } from './ynabRateLimit';

export type YnabTransactionsWriter = {
    updateTransactions: (transactions: readonly YnabPatchTransaction[]) => Promise<void>;
};

/**
 * YNAB budget-scoped writer. Credentials are read lazily so OpenAPI generation can load without secrets.
 */
export function createYnabTransactionsWriter(): YnabTransactionsWriter {
    let client: API | undefined;
    let budgetId: string | undefined;

    async function getClient(): Promise<API> {
        if (!client) {
            const apiKey = getYnabApiKey();
            if (!apiKey) {
                throw new HttpError(503, 'YNAB_API_KEY is not set');
            }
            client = new API(apiKey);
        }
        return client;
    }

    async function getBudgetId(api: API): Promise<string> {
        if (budgetId) {
            return budgetId;
        }
        const budgetName = getYnabBudgetName();
        if (!budgetName) {
            throw new HttpError(503, 'YNAB_BUDGET_NAME is not set');
        }
        const response = await api.budgets.getBudgets(true);
        const budget = response.data.budgets.find((entry) => entry.name === budgetName);
        if (!budget) {
            throw new HttpError(503, `YNAB budget ${budgetName} was not found`);
        }
        budgetId = budget.id;
        return budgetId;
    }

    return {
        async updateTransactions(transactions: readonly YnabPatchTransaction[]): Promise<void> {
            const api = await getClient();
            const id = await getBudgetId(api);
            try {
                await api.transactions.updateTransactions(id, {
                    transactions: transactions.map(toSaveTransaction),
                });
            } catch (error) {
                const retryAfterMs = ynabRetryAfterMs(error);
                if (retryAfterMs !== undefined) {
                    throw new YnabRateLimitError(retryAfterMs);
                }
                throw new HttpError(502, ynabErrorMessage(error));
            }
        },
    };
}

/**
 * Maps one PATCH item onto the SDK shape. Absent fields stay absent so YNAB leaves them alone;
 * explicit nulls are forwarded so YNAB clears them.
 */
export function toSaveTransaction(transaction: YnabPatchTransaction): SaveTransactionWithIdOrImportId {
    return {
        id: transaction.id,
        approved: transaction.approved,
        ...(transaction.category_id === undefined ? {} : { category_id: transaction.category_id }),
        ...(transaction.payee_name ? { payee_name: transaction.payee_name } : {}),
        ...(transaction.memo === undefined ? {} : { memo: transaction.memo }),
        ...(transaction.flag_color === undefined ? {} : { flag_color: transaction.flag_color }),
        ...(transaction.subtransactions ? { subtransactions: [...transaction.subtransactions] } : {}),
    };
}
