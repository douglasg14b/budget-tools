import type { AppDatabaseClient } from '../../data-persistence/database';
import { getOperatingMode } from '../operatingMode/data/operatingModeRepo';
import { HttpError } from '../travelWindows/HttpError';

/**
 * Live SQLite lookup only. Practice Classify must use match-preview with session receipts.
 */
export async function assertReceiptLiveLookupAllowed(db?: AppDatabaseClient): Promise<void> {
    const mode = await getOperatingMode(db);
    if (mode === 'live') {
        return;
    }
    throw new HttpError(403, 'Receipt Live lookup is disabled in practice mode; use match-preview');
}
