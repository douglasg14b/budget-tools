import { logInfo, logSection, logSubSection } from '@budget-tools/logging';
import type * as ynab from 'ynab';

import type { NewTransaction, SubTransactionSchema, Transaction } from './data';
import { trackingRepository, transactionsRepository } from './repositories';
import { chunkArray } from './utils';
import type { YnabTransaction } from './ynab';
import { ynabService } from './ynab';

logSection('Starting Transactions Retrieval');

logSubSection('Pulling transactions from YNAB');

const ynabDelta = await trackingRepository.getYnabLastServerKnowledge();
const { transactions, serverKnowledge } = await ynabService.getTransactions(ynabDelta || undefined);

logInfo(`Got ${transactions.length} transactions from YNAB`);

// Transactions we need to delete if we track them
const deletedTransactions = transactions.filter((transaction) => transaction.deleted);
const newOrUpdatedTransactions = transactions.filter((transaction) => !transaction.deleted);

logInfo(`Deleting ${deletedTransactions.length} transactions`);
logInfo(`Upserting ${newOrUpdatedTransactions.length} transactions`);

logSubSection('Processing Transactions');

for (const transaction of deletedTransactions) {
    await transactionsRepository.deleteTransaction(transaction.id);
}

const chunks = chunkArray(newOrUpdatedTransactions, 10);
let countCompleted = 0;
for (const chunk of chunks) {
    const promises = [];
    for (const transaction of chunk) {
        promises.push(
            (async () => {
                const existing = await transactionsRepository.getTransaction(transaction.id);

                const entity = createOrUpdateEntity(transaction, existing);
                await transactionsRepository.upsertTransaction(entity);
                countCompleted++;
            })(),
        );
    }

    await Promise.all(promises);

    if (newOrUpdatedTransactions.length > 500 && countCompleted % 10 === 0) {
        console.log(`Processed ${countCompleted}/${newOrUpdatedTransactions.length}`);
    } else if (newOrUpdatedTransactions.length <= 500) {
        console.log(`Processed ${countCompleted}/${newOrUpdatedTransactions.length}`);
    }
}

logSubSection('Finished processing transactions. Cleaning up.');

await trackingRepository.setLastServerKnowledge(serverKnowledge);
await trackingRepository.setLastPulledAt(new Date());

logSubSection('DONE');

// We effectively just replace the entity values here
function createOrUpdateEntity(
    ynabTransaction: YnabTransaction,
    tracked: Transaction | null | undefined,
): NewTransaction | Transaction {
    return {
        id: ynabTransaction.id,
        // Our query lib wants different types for updates vs inserts for dates, idk wy, it's asinine
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
        subtransactions: createSubtransactions(ynabTransaction.subtransactions),
        meta: createTransactionMetaData(ynabTransaction, tracked),
    };
}

function createSubtransactions(subtransactions: ynab.SubTransaction[]): SubTransactionSchema[] {
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

function createTransactionMetaData(ynabTransaction: YnabTransaction, tracked: Transaction | null | undefined) {
    let now = new Date().toISOString();
    const cleared = ynabTransaction.cleared === 'cleared' || ynabTransaction.cleared === 'reconciled';
    const approved = ynabTransaction.approved;
    const categorized = !!ynabTransaction.category_id;

    // If this is the first time we've seen this transaction, and it's already cleared, approved, and categorized.
    // We'll assume that was done the date of teh transaction since we don't have a better date.
    const newAndCompleted = !tracked && cleared && approved && categorized;
    if (newAndCompleted) {
        now = ynabTransaction.date.toISOString();
    }

    const meta = tracked?.meta || {
        first_seen_date: now,
        first_cleared_date: cleared ? now : null,
        first_approved_date: approved ? now : null,
        first_categorized_date: approved ? now : null,
    };

    if (tracked) {
        if (!meta.first_approved_date && approved) {
            meta.first_approved_date = now;
        }

        if (!meta.first_cleared_date && cleared) {
            meta.first_cleared_date = now;
        }

        if (!meta.first_categorized_date && categorized) {
            meta.first_categorized_date = now;
        }

        if (!meta.first_seen_date) {
            console.error(`Transaction ${ynabTransaction.id} has no first_seen_date`);
            meta.first_seen_date = now;
        }
    }

    return meta;
}
