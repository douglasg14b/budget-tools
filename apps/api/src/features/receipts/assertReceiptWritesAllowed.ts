import type { AppDatabaseClient } from '../../data-persistence/database';
import { getOperatingMode } from '../operatingMode/data/operatingModeRepo';
import { HttpError } from '../travelWindows/HttpError';

/**
 * Call from receipt persist paths. Practice must not write files or SQLite receipt rows.
 */
export async function assertReceiptWritesAllowed(db?: AppDatabaseClient): Promise<void> {
    const mode = await getOperatingMode(db);
    if (mode === 'live') {
        return;
    }
    throw new HttpError(403, 'Receipt writes are disabled in practice mode');
}
