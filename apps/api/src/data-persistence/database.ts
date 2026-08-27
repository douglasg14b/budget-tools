import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import SqliteDatabase from 'better-sqlite3';
import { CamelCasePlugin, Kysely, SqliteDialect } from 'kysely';

import { getSqliteDbPath } from '../environment';
import type { AmazonSplitOverlaysTable } from '../features/amazonClassify/data/amazonSplitOverlaySchema';
import type {
    AmazonOrderItemsTable,
    AmazonOrdersTable,
    AmazonPaymentsTable,
    AmazonSyncStateTable,
} from '../features/amazonOrders/data/amazonOrdersSchema';
import type { OperatingModeTable } from '../features/operatingMode/data/operatingModeSchema';
import type { TravelBiasConfigTable } from '../features/travelWindows/data/travelBiasConfigSchema';
import type { TravelWindowAccountsTable, TravelWindowsTable } from '../features/travelWindows/data/travelWindowsSchema';
import { migrateToLatest } from './migrate';
import { SqlDatePlugin } from './plugins/sqlDatePlugin';
import { SqliteBindingPlugin } from './plugins/sqliteBindingPlugin';

/**
 * API SQLite schema. Feature tables are declared next to their features and composed here.
 * Budget Tools YNAB data stays on Postgres via `getDatabase()`.
 */
export type AppDatabase = {
    travel_windows: TravelWindowsTable;
    travel_window_accounts: TravelWindowAccountsTable;
    travel_bias_config: TravelBiasConfigTable;
    amazon_payments: AmazonPaymentsTable;
    amazon_orders: AmazonOrdersTable;
    amazon_order_items: AmazonOrderItemsTable;
    amazon_sync_state: AmazonSyncStateTable;
    amazon_split_overlays: AmazonSplitOverlaysTable;
    operating_mode: OperatingModeTable;
};

export type AppDatabaseClient = Kysely<AppDatabase>;

let opening: Promise<AppDatabaseClient> | undefined;

export function createAppDatabase(filePath: string): AppDatabaseClient {
    if (filePath !== ':memory:') {
        mkdirSync(dirname(filePath), { recursive: true });
    }

    return new Kysely<AppDatabase>({
        dialect: new SqliteDialect({
            database: new SqliteDatabase(filePath),
        }),
        plugins: [
            new SqliteBindingPlugin<AppDatabase>({
                travel_bias_config: ['enabled'],
                amazon_payments: ['isRefund'],
                amazon_sync_state: ['lastAuthenticated'],
            }),
            new CamelCasePlugin(),
            new SqlDatePlugin<AppDatabase>({
                travel_windows: ['createdAt', 'updatedAt'],
            }),
        ],
    });
}

/**
 * Lazily opens the API SQLite file and migrates it. Safe to call from request handlers.
 */
export function getAppDatabase(): Promise<AppDatabaseClient> {
    if (!opening) {
        opening = openAppDatabase();
    }
    return opening;
}

async function openAppDatabase(): Promise<AppDatabaseClient> {
    const database = createAppDatabase(getSqliteDbPath());
    await migrateToLatest(database);
    return database;
}
