import type { AppDatabaseClient } from '../../data-persistence/database';
import { getOperatingMode } from '../operatingMode/data/operatingModeRepo';
import type { AutoBindDeps } from './autoBindReceipt';
import { autoBindReceipt } from './autoBindReceipt';
import type { ReceiptRow } from './data/receiptsRepo';
import { listUnboundReceiptsForBinding } from './data/receiptsRepo';

type ListUnboundReceipts = (db?: AppDatabaseClient) => Promise<readonly ReceiptRow[]>;

/**
 * Retries auto-binding for completed receipts that remain unbound, so a bank
 * charge that arrives days after the photo still binds without anyone opening
 * the receipt. Transactions are written by a separate cron container, so this
 * poll is the hook for "a new charge landed".
 */
export async function sweepUnboundReceiptBindings(
    deps: AutoBindDeps = {},
    listUnbound: ListUnboundReceipts = listUnboundReceiptsForBinding,
): Promise<number> {
    if ((await getOperatingMode(deps.db)) !== 'live') {
        return 0;
    }

    let bound = 0;
    for (const receipt of await listUnbound(deps.db)) {
        const result = await autoBindReceipt(receipt, deps);
        if (result?.outcome === 'bound') {
            bound += 1;
        }
    }
    return bound;
}
