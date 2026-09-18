import type { AppDatabaseClient } from '../../data-persistence/database';
import { getOperatingMode } from '../operatingMode/data/operatingModeRepo';
import type { ReceiptRow } from './data/receiptsRepo';
import { bindReceiptIfUnbound, listUnboundReceiptsForBinding } from './data/receiptsRepo';
import { listTransactionsForReceiptMatch } from './listTransactionsForReceiptMatch';
import { receiptRowToMatchKeys, transactionDetailToMatchKeys } from './lookupReceiptMatch';
import { matchTransactionsToReceipt } from './matchReceipts';

type ListUnboundReceipts = (db?: AppDatabaseClient) => Promise<readonly ReceiptRow[]>;
type ListMatchTransactions = (purchaseDate: string) => ReturnType<typeof listTransactionsForReceiptMatch>;
type ClaimReceiptBinding = (receiptId: string, transactionId: string, db?: AppDatabaseClient) => Promise<boolean>;

/**
 * Replays the exact, receipt-detail auto-bind decision for completed receipts that remain unbound.
 * This makes delayed bank imports bind without relying on someone opening the receipt UI.
 */
export async function sweepUnboundReceiptBindings(
    db?: AppDatabaseClient,
    listUnbound: ListUnboundReceipts = listUnboundReceiptsForBinding,
    listTransactions: ListMatchTransactions = listTransactionsForReceiptMatch,
    claim: ClaimReceiptBinding = bindReceiptIfUnbound,
): Promise<number> {
    if ((await getOperatingMode(db)) !== 'live') {
        return 0;
    }

    let bound = 0;
    for (const receipt of await listUnbound(db)) {
        if (!receipt.purchaseDate) {
            continue;
        }
        const transactions = await listTransactions(receipt.purchaseDate);
        const match = matchTransactionsToReceipt({
            receipt: receiptRowToMatchKeys(receipt),
            transactions: transactions.map(transactionDetailToMatchKeys),
        });
        if (!match.autoBind || !match.exactTransactionId) {
            continue;
        }
        if (await claim(receipt.id, match.exactTransactionId, db)) {
            bound += 1;
        }
    }
    return bound;
}
