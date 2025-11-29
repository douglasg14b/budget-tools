import type { DatabaseClient, NewTransaction, Transaction, TransactionUpdate } from '../data';
import { database } from '../data';

export interface ITransactionsRepository {
    getTransactions(): Promise<Transaction[]>;
    getTransaction(transactionId: string): Promise<Transaction | undefined>;
    deleteTransaction(transactionId: string): Promise<unknown>;
    upsertTransaction(transaction: Transaction | NewTransaction): Promise<unknown>;
    insertTransaction(transaction: NewTransaction): Promise<unknown>;
    updateTransaction(transaction: Transaction): Promise<unknown>;
    transactionTracked(transactionId: string): Promise<boolean>;
}

export class TransactionsRepository implements ITransactionsRepository {
    private dbClient: DatabaseClient;

    constructor(dbClient: DatabaseClient) {
        this.dbClient = dbClient;
    }

    public async getTransactions() {
        return await this.dbClient.selectFrom('transactions').selectAll().execute();
    }

    public async getTransaction(transactionId: string) {
        return await this.dbClient
            .selectFrom('transactions')
            .where('id', '=', transactionId)
            .selectAll()
            .executeTakeFirst();
    }

    public async deleteTransaction(transactionId: string) {
        return await this.dbClient.deleteFrom('transactions').where('id', '=', transactionId).execute();
    }

    public async upsertTransaction(transaction: Transaction | NewTransaction) {
        const exists = await this.transactionTracked(transaction.id);

        try {
            if (exists) {
                return this.updateTransaction(transaction as Transaction);
            } else {
                return this.insertTransaction(transaction as NewTransaction);
            }
        } catch (err) {
            console.error(`Error upserting transaction ${transaction.id}`, err);
            console.error(JSON.stringify(transaction, null, 2));
            throw err;
        }
    }

    public async insertTransaction(transaction: NewTransaction) {
        try {
            if (transaction.subtransactions) {
                transaction.subtransactions = JSON.stringify(transaction.subtransactions);
            }
            return await this.dbClient.insertInto('transactions').values(transaction).execute();
        } catch (err) {
            console.error(`Error inserting transaction ${transaction.id}`, err);
            console.error(JSON.stringify(transaction, null, 2));
            throw err;
        }
    }

    public async updateTransaction(transaction: Transaction) {
        try {
            const toUpdate = { ...transaction } as unknown as TransactionUpdate;
            if (toUpdate.subtransactions) {
                toUpdate.subtransactions = JSON.stringify(transaction.subtransactions);
            }
            return await this.dbClient
                .updateTable('transactions')
                .set(toUpdate)
                .where('id', '=', transaction.id)
                .execute();
        } catch (err) {
            console.error(`Error inserting transaction ${transaction.id}`, err);
            console.error(JSON.stringify(transaction, null, 2));
            throw err;
        }
    }

    /** Is the transaction tracked in the DB */
    public async transactionTracked(transactionId: string) {
        const record = await this.dbClient
            .selectFrom('transactions')
            .where('id', '=', transactionId)
            .select('id')
            .executeTakeFirst();

        return !!record;
    }
}

export const transactionsRepository = new TransactionsRepository(database);
