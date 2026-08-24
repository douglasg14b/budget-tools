import type { AppDatabaseClient } from '../../../data-persistence/database';
import { getAppDatabase } from '../../../data-persistence/database';
import type { TravelWindowKind, TravelWindowRow } from './travelWindowsSchema';

export type TravelWindowWrite = {
    name: string;
    kind: TravelWindowKind;
    startDate: string;
    endDate: string;
    accountId: string | null;
    accountName: string | null;
};

export async function listTravelWindowRows(db?: AppDatabaseClient): Promise<TravelWindowRow[]> {
    const database = db ?? (await getAppDatabase());
    return await database
        .selectFrom('travel_windows')
        .selectAll()
        .orderBy('startDate', 'desc')
        .orderBy('name', 'asc')
        .execute();
}

export async function insertTravelWindowRow(
    id: string,
    input: TravelWindowWrite,
    db?: AppDatabaseClient,
): Promise<void> {
    const database = db ?? (await getAppDatabase());
    const now = new Date();
    await database
        .insertInto('travel_windows')
        .values({
            id,
            name: input.name,
            kind: input.kind,
            startDate: input.startDate,
            endDate: input.endDate,
            accountId: input.accountId,
            accountName: input.accountName,
            createdAt: now,
            updatedAt: now,
        })
        .execute();
}

export async function updateTravelWindowRow(
    id: string,
    input: TravelWindowWrite,
    db?: AppDatabaseClient,
): Promise<boolean> {
    const database = db ?? (await getAppDatabase());
    const updated = await database
        .updateTable('travel_windows')
        .set({
            name: input.name,
            kind: input.kind,
            startDate: input.startDate,
            endDate: input.endDate,
            accountId: input.accountId,
            accountName: input.accountName,
            updatedAt: new Date(),
        })
        .where('id', '=', id)
        .executeTakeFirst();
    return Number(updated.numUpdatedRows) > 0;
}

export async function deleteTravelWindowRow(id: string, db?: AppDatabaseClient): Promise<boolean> {
    const database = db ?? (await getAppDatabase());
    const deleted = await database.deleteFrom('travel_windows').where('id', '=', id).executeTakeFirst();
    return Number(deleted.numDeletedRows) > 0;
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

export async function listTravelWindowSignatureRows(
    db?: AppDatabaseClient,
): Promise<Array<Pick<TravelWindowRow, 'id' | 'kind' | 'startDate' | 'endDate' | 'accountId'>>> {
    const database = db ?? (await getAppDatabase());
    return await database
        .selectFrom('travel_windows')
        .select(['id', 'kind', 'startDate', 'endDate', 'accountId'])
        .execute();
}
