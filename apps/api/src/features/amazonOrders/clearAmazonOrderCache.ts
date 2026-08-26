import { createAppDatabase } from '../../data-persistence/database';
import { migrateToLatest } from '../../data-persistence/migrate';
import { getSqliteDbPath } from '../../environment';
import { deleteAllAmazonSplitOverlays } from '../amazonClassify/data/amazonSplitOverlayRepo';
import { countAmazonCache, deleteAllAmazonOrders } from './data/amazonOrdersRepo';

async function main(): Promise<void> {
    const sqlitePath = getSqliteDbPath();
    const database = createAppDatabase(sqlitePath);
    try {
        await migrateToLatest(database);
        const before = await countAmazonCache(database);
        const overlays = await deleteAllAmazonSplitOverlays(database);
        const deleted = await deleteAllAmazonOrders(database);
        const after = await countAmazonCache(database);
        console.log(`Cleared Amazon order cache at ${sqlitePath}`);
        console.log(
            `Removed ${deleted.orders} orders, ${deleted.items} items, ${overlays} split overlays (was ${before.orders} orders).`,
        );
        console.log(`Kept ${after.payments} payments. Sync Amazon from Classify to re-scrape orders.`);
    } finally {
        await database.destroy();
    }
}

void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
