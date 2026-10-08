import type { AppDatabaseClient } from '../../../data-persistence/database';
import { getAppDatabase } from '../../../data-persistence/database';

/** Smoothing window in days, keyed by category id. Categories absent from the map are not smoothed. */
export async function loadSmoothingWindows(db?: AppDatabaseClient): Promise<Map<string, number>> {
    const database = db ?? (await getAppDatabase());
    const rows = await database.selectFrom('category_smoothing').select(['categoryId', 'windowDays']).execute();
    return new Map(rows.map((row) => [row.categoryId, row.windowDays]));
}

/** Sets a category's window; a window of 1 day means "not smoothed" and removes the row. */
export async function saveSmoothingWindow(
    categoryId: string,
    windowDays: number,
    db?: AppDatabaseClient,
): Promise<void> {
    const database = db ?? (await getAppDatabase());
    if (windowDays <= 1) {
        await database.deleteFrom('category_smoothing').where('categoryId', '=', categoryId).execute();
        return;
    }
    const updatedAt = new Date().toISOString();
    await database
        .insertInto('category_smoothing')
        .values({ categoryId, windowDays, updatedAt })
        .onConflict((conflict) => conflict.column('categoryId').doUpdateSet({ windowDays, updatedAt }))
        .execute();
}
