import type { AppDatabaseClient } from '../../../data-persistence/database';
import { getAppDatabase } from '../../../data-persistence/database';
import type { OperatingMode } from '../operatingMode';
import { assertYnabWritesAllowed, isOperatingMode } from '../operatingMode';

export async function getOperatingMode(db?: AppDatabaseClient): Promise<OperatingMode> {
    const database = db ?? (await getAppDatabase());
    const row = await database.selectFrom('operating_mode').selectAll().where('id', '=', 1).executeTakeFirst();
    if (!row) {
        throw new Error('operating_mode is missing; run API SQLite migrations');
    }
    if (!isOperatingMode(row.mode)) {
        throw new Error(`operating_mode.mode is invalid: ${JSON.stringify(row.mode)}`);
    }
    return row.mode;
}

export async function setOperatingMode(mode: OperatingMode, db?: AppDatabaseClient): Promise<void> {
    const database = db ?? (await getAppDatabase());
    const updated = await database.updateTable('operating_mode').set({ mode }).where('id', '=', 1).executeTakeFirst();
    if (Number(updated.numUpdatedRows) === 0) {
        throw new Error('operating_mode is missing; run API SQLite migrations');
    }
}

/**
 * Call from YNAB write endpoints before mutating YNAB or enqueueing outbound sync.
 */
export async function requireLiveMode(db?: AppDatabaseClient): Promise<void> {
    assertYnabWritesAllowed(await getOperatingMode(db));
}
