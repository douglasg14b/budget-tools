import type { AppDatabaseClient } from '../../../data-persistence/database';
import { getAppDatabase } from '../../../data-persistence/database';
import type { TravelWindowKind, TravelWindowRow } from './travelWindowsSchema';

export type TravelWindowAccountWrite = {
    id: string;
    name: string;
};

export type TravelWindowWrite = {
    name: string;
    kind: TravelWindowKind;
    startDate: string;
    endDate: string;
    location: string | null;
    accounts: TravelWindowAccountWrite[];
};

export type TravelWindowListRow = TravelWindowRow & {
    accounts: TravelWindowAccountWrite[];
};

export async function listTravelWindowRows(db?: AppDatabaseClient): Promise<TravelWindowListRow[]> {
    const database = db ?? (await getAppDatabase());
    const windows = await database
        .selectFrom('travel_windows')
        .selectAll()
        .orderBy('startDate', 'desc')
        .orderBy('name', 'asc')
        .execute();
    const accountRows = await database
        .selectFrom('travel_window_accounts')
        .selectAll()
        .orderBy('accountName', 'asc')
        .orderBy('accountId', 'asc')
        .execute();
    const accountsByWindow = groupAccounts(accountRows);
    return windows.map((window) => ({
        ...window,
        accounts: accountsByWindow.get(window.id) ?? [],
    }));
}

export async function insertTravelWindowRow(
    id: string,
    input: TravelWindowWrite,
    db?: AppDatabaseClient,
): Promise<void> {
    const database = db ?? (await getAppDatabase());
    const now = new Date();
    await database.transaction().execute(async (trx) => {
        await trx
            .insertInto('travel_windows')
            .values({
                id,
                name: input.name,
                kind: input.kind,
                startDate: input.startDate,
                endDate: input.endDate,
                location: input.location,
                createdAt: now,
                updatedAt: now,
            })
            .execute();
        await replaceAccounts(trx, id, input.accounts);
    });
}

export async function updateTravelWindowRow(
    id: string,
    input: TravelWindowWrite,
    db?: AppDatabaseClient,
): Promise<boolean> {
    const database = db ?? (await getAppDatabase());
    return await database.transaction().execute(async (trx) => {
        const updated = await trx
            .updateTable('travel_windows')
            .set({
                name: input.name,
                kind: input.kind,
                startDate: input.startDate,
                endDate: input.endDate,
                location: input.location,
                updatedAt: new Date(),
            })
            .where('id', '=', id)
            .executeTakeFirst();
        if (Number(updated.numUpdatedRows) === 0) {
            return false;
        }
        await replaceAccounts(trx, id, input.accounts);
        return true;
    });
}

export async function deleteTravelWindowRow(id: string, db?: AppDatabaseClient): Promise<boolean> {
    const database = db ?? (await getAppDatabase());
    return await database.transaction().execute(async (trx) => {
        await trx.deleteFrom('travel_window_accounts').where('windowId', '=', id).execute();
        const deleted = await trx.deleteFrom('travel_windows').where('id', '=', id).executeTakeFirst();
        return Number(deleted.numDeletedRows) > 0;
    });
}

export async function getTravelBiasEnabled(db?: AppDatabaseClient): Promise<boolean> {
    const database = db ?? (await getAppDatabase());
    const row = await database.selectFrom('travel_bias_config').selectAll().where('id', '=', 1).executeTakeFirst();
    if (!row) {
        throw new Error('travel_bias_config is missing; run API SQLite migrations');
    }
    return row.enabled;
}

export async function setTravelBiasEnabled(enabled: boolean, db?: AppDatabaseClient): Promise<void> {
    const database = db ?? (await getAppDatabase());
    const updated = await database
        .updateTable('travel_bias_config')
        .set({ enabled })
        .where('id', '=', 1)
        .executeTakeFirst();
    if (Number(updated.numUpdatedRows) === 0) {
        throw new Error('travel_bias_config is missing; run API SQLite migrations');
    }
}

export async function listTravelWindowSignatureRows(db?: AppDatabaseClient): Promise<
    Array<{
        id: string;
        kind: TravelWindowKind;
        startDate: string;
        endDate: string;
        location: string | null;
        accountIds: string[];
    }>
> {
    const windows = await listTravelWindowRows(db);
    return windows.map((window) => ({
        id: window.id,
        kind: window.kind,
        startDate: window.startDate,
        endDate: window.endDate,
        location: window.location,
        accountIds: window.accounts.map((account) => account.id),
    }));
}

async function replaceAccounts(
    database: AppDatabaseClient,
    windowId: string,
    accounts: readonly TravelWindowAccountWrite[],
): Promise<void> {
    await database.deleteFrom('travel_window_accounts').where('windowId', '=', windowId).execute();
    if (accounts.length === 0) {
        return;
    }
    await database
        .insertInto('travel_window_accounts')
        .values(
            accounts.map((account) => ({
                windowId,
                accountId: account.id,
                accountName: account.name,
            })),
        )
        .execute();
}

function groupAccounts(
    rows: Array<{ windowId: string; accountId: string; accountName: string }>,
): Map<string, TravelWindowAccountWrite[]> {
    const grouped = new Map<string, TravelWindowAccountWrite[]>();
    for (const row of rows) {
        const existing = grouped.get(row.windowId) ?? [];
        existing.push({ id: row.accountId, name: row.accountName });
        grouped.set(row.windowId, existing);
    }
    return grouped;
}
