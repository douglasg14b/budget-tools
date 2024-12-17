import { YNAB_API_KEY, YNAB_BUDGET_NAME } from '../environment';
import * as ynab from 'ynab';

export type YnabTransaction = Omit<ynab.TransactionDetail, 'date'> & { date: Date };

export class YnabService {
    private _cachedBudget: ynab.BudgetSummary | null = null;
    private client: ynab.API;

    constructor(apiKey: string) {
        this.client = new ynab.API(apiKey);
    }

    public async getTransactions(lastServerKnowledge?: number) {
        const budget = await this.getBudget();

        const response = await this.client.transactions.getTransactions(
            budget.id,
            undefined,
            undefined,
            lastServerKnowledge,
        );

        const newServerKnowledge = response.data.server_knowledge;
        const mappedTransactions = response.data.transactions.map((transaction) => ({
            ...transaction,
            date: new Date(transaction.date),
        }));

        return {
            transactions: mappedTransactions,
            serverKnowledge: newServerKnowledge,
        };
    }

    public async getBudget() {
        if (this._cachedBudget && this._cachedBudget.name === YNAB_BUDGET_NAME) {
            return this._cachedBudget;
        }

        const budget = (await this.client.budgets.getBudgets(true)).data.budgets.find(
            (budget) => budget.name === YNAB_BUDGET_NAME,
        );

        if (!budget) throw new Error(`Budget ${YNAB_BUDGET_NAME} not found`);

        this._cachedBudget = budget;

        return budget;
    }
}

export const ynabService = new YnabService(YNAB_API_KEY);
