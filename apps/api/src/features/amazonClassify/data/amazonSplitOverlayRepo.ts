import type { AppDatabaseClient } from '../../../data-persistence/database';
import { getAppDatabase } from '../../../data-persistence/database';
import type { AmazonSplitOverlayDto } from '../amazonClassifyDtos';

export async function getAmazonSplitOverlay(
    transactionId: string,
    fingerprint: string,
    db?: AppDatabaseClient,
): Promise<AmazonSplitOverlayDto | null> {
    const database = db ?? (await getAppDatabase());
    const row = await database
        .selectFrom('amazon_split_overlays')
        .selectAll()
        .where('transactionId', '=', transactionId)
        .executeTakeFirst();
    if (!row || row.fingerprint !== fingerprint) {
        return null;
    }
    return parseStoredOverlay(row.overlayJson, transactionId);
}

export async function deleteAmazonSplitOverlaysForOrders(
    orderIds: readonly string[],
    db?: AppDatabaseClient,
): Promise<number> {
    if (orderIds.length === 0) {
        return 0;
    }
    const wanted = new Set(orderIds);
    const database = db ?? (await getAppDatabase());
    const rows = await database.selectFrom('amazon_split_overlays').selectAll().execute();
    let deleted = 0;
    for (const row of rows) {
        const overlay = parseStoredOverlay(row.overlayJson, row.transactionId);
        if (!overlay?.orderIds.some((orderId) => wanted.has(orderId))) {
            continue;
        }
        await database.deleteFrom('amazon_split_overlays').where('transactionId', '=', row.transactionId).execute();
        deleted += 1;
    }
    return deleted;
}

export async function deleteAllAmazonSplitOverlays(db?: AppDatabaseClient): Promise<number> {
    const database = db ?? (await getAppDatabase());
    const result = await database.deleteFrom('amazon_split_overlays').executeTakeFirst();
    return Number(result?.numDeletedRows ?? 0);
}

export async function upsertAmazonSplitOverlay(
    transactionId: string,
    fingerprint: string,
    overlay: AmazonSplitOverlayDto,
    db?: AppDatabaseClient,
): Promise<void> {
    const database = db ?? (await getAppDatabase());
    const now = new Date().toISOString();
    await database
        .insertInto('amazon_split_overlays')
        .values({
            transactionId,
            fingerprint,
            overlayJson: JSON.stringify(overlay),
            updatedAt: now,
        })
        .onConflict((conflict) =>
            conflict.column('transactionId').doUpdateSet({
                fingerprint: (eb) => eb.ref('excluded.fingerprint'),
                overlayJson: (eb) => eb.ref('excluded.overlayJson'),
                updatedAt: (eb) => eb.ref('excluded.updatedAt'),
            }),
        )
        .execute();
}

function parseStoredOverlay(raw: string, transactionId: string): AmazonSplitOverlayDto | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw) as unknown;
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== 'object') {
        return null;
    }
    const record = parsed as AmazonSplitOverlayDto;
    if (record.transactionId !== transactionId || !Array.isArray(record.lines) || !Array.isArray(record.items)) {
        return null;
    }
    if (record.items.length === 0) {
        return null;
    }
    return record;
}
