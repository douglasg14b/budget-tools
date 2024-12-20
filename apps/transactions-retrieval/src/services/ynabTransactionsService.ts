import { logInfo } from '@budget-tools/logging';
import dayjs from 'dayjs';
import type * as ynab from 'ynab';

import type { NewTransaction, SubTransactionSchema, Transaction } from '../data';
import type { TrackingRepository, TransactionsRepository } from '../repositories';
import { trackingRepository, transactionsRepository } from '../repositories';
import { chunkArray } from '../utils';
import type { YnabService, YnabTransaction } from '../ynab';
import { ynabService } from '../ynab';

interface Dependencies {
    trackingRepository: TrackingRepository;
    transactionsRepository: TransactionsRepository;
    ynabService: YnabService;
}

export class YnabTransactionsService {
    constructor(private readonly dependencies: Dependencies) {}

    public async processTransactions() {
        const { trackingRepository, ynabService } = this.dependencies;
        const ynabDelta = await trackingRepository.getYnabLastServerKnowledge();
        const { transactions, serverKnowledge } = await ynabService.getTransactions(ynabDelta || undefined);

        logInfo(`Got ${transactions.length} transactions from YNAB`);

        const deletedTransactions = transactions.filter((transaction) => transaction.deleted);
        const newOrUpdatedTransactions = transactions.filter((transaction) => !transaction.deleted);

        logInfo(`Deleting ${deletedTransactions.length} transactions`);
        logInfo(`Upserting ${newOrUpdatedTransactions.length} transactions`);

        await this.processDeletedTransactions(deletedTransactions);
        await this.processNewOrUpdatedTransactions(newOrUpdatedTransactions);

        await trackingRepository.setLastServerKnowledge(serverKnowledge);
        await trackingRepository.setLastPulledAt(new Date());
    }

    private async processDeletedTransactions(deletedTransactions: YnabTransaction[]) {
        const { transactionsRepository } = this.dependencies;
        for (const transaction of deletedTransactions) {
            await transactionsRepository.deleteTransaction(transaction.id);
        }
    }

    private async processNewOrUpdatedTransactions(transactions: YnabTransaction[]) {
        const { transactionsRepository } = this.dependencies;
        const chunks = chunkArray(transactions, 10);
        let countCompleted = 0;

        for (const chunk of chunks) {
            const promises = chunk.map((transaction) =>
                (async () => {
                    const existing = await transactionsRepository.getTransaction(transaction.id);
                    const entity = this.createOrUpdateEntity(transaction, existing);
                    await transactionsRepository.upsertTransaction(entity);
                    countCompleted++;
                })(),
            );

            await Promise.all(promises);

            if (transactions.length > 500 && countCompleted % 10 === 0) {
                console.log(`Processed ${countCompleted}/${transactions.length}`);
            } else if (transactions.length <= 500) {
                console.log(`Processed ${countCompleted}/${transactions.length}`);
            }
        }
    }

    private createOrUpdateEntity(
        ynabTransaction: YnabTransaction,
        tracked: Transaction | null | undefined,
    ): NewTransaction | Transaction {
        return {
            id: ynabTransaction.id,
            date: tracked ? new Date(ynabTransaction.date) : ynabTransaction.date,
            amount: ynabTransaction.amount,
            memo: ynabTransaction.memo || null,
            cleared: ynabTransaction.cleared,
            approved: ynabTransaction.approved,
            flag_color: ynabTransaction.flag_color || null,
            flag_name: ynabTransaction.flag_name || null,
            account_id: ynabTransaction.account_id,
            payee_id: ynabTransaction.payee_id || null,
            category_id: ynabTransaction.category_id || null,
            transfer_account_id: ynabTransaction.transfer_account_id || null,
            transfer_transaction_id: ynabTransaction.transfer_transaction_id || null,
            matched_transaction_id: ynabTransaction.matched_transaction_id || null,
            import_id: ynabTransaction.import_id || null,
            import_payee_name: ynabTransaction.import_payee_name || null,
            import_payee_name_original: ynabTransaction.import_payee_name_original || null,
            debt_transaction_type: ynabTransaction.debt_transaction_type || null,
            deleted: ynabTransaction.deleted,
            account_name: ynabTransaction.account_name,
            payee_name: ynabTransaction.payee_name || null,
            category_name: ynabTransaction.category_name || null,
            subtransactions: this.createSubtransactions(ynabTransaction.subtransactions),
            meta: this.createTransactionMetaData(ynabTransaction, tracked),
        };
    }

    private createSubtransactions(subtransactions: ynab.SubTransaction[]): SubTransactionSchema[] {
        return subtransactions.map((subTransaction) => ({
            id: subTransaction.id,
            transaction_id: subTransaction.transaction_id,
            amount: subTransaction.amount,
            memo: subTransaction.memo || null,
            payee_id: subTransaction.payee_id || null,
            payee_name: subTransaction.payee_name || null,
            category_id: subTransaction.category_id || null,
            category_name: subTransaction.category_name || null,
            transfer_account_id: subTransaction.transfer_account_id || null,
            transfer_transaction_id: subTransaction.transfer_transaction_id || null,
            deleted: subTransaction.deleted,
        }));
    }

    private createTransactionMetaData(ynabTransaction: YnabTransaction, tracked: Transaction | null | undefined) {
        const getApplicableDateTime = () => {
            const transactionDate = dayjs(ynabTransaction.date)
                .set('hour', 0)
                .set('minute', 0)
                .set('second', 0)
                .set('millisecond', 0);
            const todayDate = dayjs().set('hour', 0).set('minute', 0).set('second', 0).set('millisecond', 0);

            return transactionDate.isBefore(todayDate) ? ynabTransaction.date.toISOString() : new Date().toISOString();
        };

        const now = getApplicableDateTime();
        const cleared = ynabTransaction.cleared === 'cleared' || ynabTransaction.cleared === 'reconciled';
        const approved = ynabTransaction.approved;
        const categorized = !!ynabTransaction.category_id;

        const meta = tracked?.meta || {
            first_seen_date: now,
            first_cleared_date: cleared ? now : null,
            first_approved_date: approved ? now : null,
            first_categorized_date: categorized ? now : null,
        };

        if (tracked) {
            if (!meta.first_approved_date && approved) meta.first_approved_date = now;
            if (!meta.first_cleared_date && cleared) meta.first_cleared_date = now;
            if (!meta.first_categorized_date && categorized) meta.first_categorized_date = now;
            if (!meta.first_seen_date) {
                console.error(`Transaction ${ynabTransaction.id} has no first_seen_date`);
                meta.first_seen_date = now;
            }
        }

        return meta;
    }
}

// Create the singleton instance with all dependencies
export const ynabTransactionsService = new YnabTransactionsService({
    trackingRepository,
    transactionsRepository,
    ynabService,
});
