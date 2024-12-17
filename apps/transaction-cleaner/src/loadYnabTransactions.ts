import * as ynab from 'ynab';
import { AccountName, ACCOUNTS_NAME_MAP } from './constants';
import { writeFileSync, readFileSync, existsSync } from 'fs';

const TRANSACTIONS_FILE_PATH = 'data/ynab-transactions.json';
const ACCESS_TOKEN = '==============================';
const BUDGET_NAME = 'Detailed Budget';
const YNAB_CLIENT = new ynab.API(ACCESS_TOKEN);

const OLDEST_DATE = '2022-01-01';

export async function loadYnabTransactionsByAccount(accountName: AccountName) {
    const accountsMap = await getAccounts();
    const account = accountsMap[accountName];
    if (!account) throw new Error(`Account ${accountName} not found`);

    const allTransactions = await loadYnabTransactions();
    return allTransactions.filter((transaction) => transaction.account_id === account.id);
}

export async function loadYnabTransactions() {
    let transactions = await tryLoadCachedTransactions();
    if (!transactions) {
        const budget = await getBudget();

        const response = await YNAB_CLIENT.transactions.getTransactions(budget.id, OLDEST_DATE);
        transactions = response.data.transactions;
        cacheTransactionToFile(transactions);
    }

    return transactions.filter((transaction) => new Date(transaction.date) >= new Date(OLDEST_DATE));
}

function cacheTransactionToFile(transactions: ynab.TransactionSummary[]) {
    writeFileSync(TRANSACTIONS_FILE_PATH, JSON.stringify(transactions, null, 2));
}

function tryLoadCachedTransactions() {
    if (!existsSync(TRANSACTIONS_FILE_PATH)) return null;

    const cachedTransactions = readFileSync(TRANSACTIONS_FILE_PATH, 'utf-8');
    return JSON.parse(cachedTransactions) as ynab.TransactionSummary[];
}

async function getAccounts() {
    const budget = await getBudget();

    const inverseAccountMap = invertObjectKeys(ACCOUNTS_NAME_MAP);

    const accounts = budget
        .accounts!.filter((account) => account.name in inverseAccountMap)
        .reduce<Record<AccountName, ynab.Account>>(
            (acc, account) => {
                acc[inverseAccountMap[account.name]] = account;
                return acc;
            },
            {} as Record<AccountName, ynab.Account>,
        );

    return accounts;
}

async function getBudget() {
    const budget = (await YNAB_CLIENT.budgets.getBudgets(true)).data.budgets.find(
        (budget) => budget.name === BUDGET_NAME,
    );
    if (!budget) throw new Error(`Budget ${BUDGET_NAME} not found`);

    return budget;
}

function invertObjectKeys<T extends Record<string, string>>(obj: T) {
    return Object.entries(obj).reduce<Record<string, keyof T>>(
        (acc, [key, value]) => {
            acc[value] = key;
            return acc;
        },
        {} as Record<string, keyof T>,
    );
}
