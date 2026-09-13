import type { Dialect } from 'kysely';
import { CamelCasePlugin, Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';

import { getDbConnectionString } from '../environment';
import type { AmazonSplitOverlaysTable } from '../features/amazonClassify/data/amazonSplitOverlaySchema';
import type {
    AmazonOrderItemsTable,
    AmazonOrdersTable,
    AmazonPaymentsTable,
    AmazonSyncStateTable,
} from '../features/amazonOrders/data/amazonOrdersSchema';
import type { OperatingModeTable } from '../features/operatingMode/data/operatingModeSchema';
import type { ReceiptsTable } from '../features/receipts/data/receiptsSchema';
import type { TravelBiasConfigTable } from '../features/travelWindows/data/travelBiasConfigSchema';
import type { TravelWindowAccountsTable, TravelWindowsTable } from '../features/travelWindows/data/travelWindowsSchema';
import type { ClassificationSyncTable } from '../features/ynabSync/data/classificationSyncSchema';

const { Pool } = pg;

/**
 * API-owned application tables. These live in the shared Budget Tools Postgres alongside the
 * YNAB core schema; their DDL is owned by the `@budget-tools/db` migrator (one migrator, one DB).
 * Feature tables are declared next to their features and composed here.
 *
 * The YNAB core tables (`transactions`, `categories`, …) are queried through the separate
 * `getDatabase()` client (`../data/database`) typed as `@budget-tools/db`'s `Database`. Both
 * clients point at the same Postgres; the split is only a typing convenience.
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
    classification_sync: ClassificationSyncTable;
    receipts: ReceiptsTable;
};

export type AppDatabaseClient = Kysely<AppDatabase>;

let cached: AppDatabaseClient | undefined;

/**
 * Builds an API app-tables client over the given Kysely dialect. Tests pass a PGlite-backed
 * dialect (see `data-persistence/testDatabase.ts`); production uses a pg `Pool`. The
 * `CamelCasePlugin` bridges the snake_case Postgres columns to the camelCase schema types.
 */
export function createAppDatabaseFromDialect(dialect: Dialect): AppDatabaseClient {
    return new Kysely<AppDatabase>({
        dialect,
        plugins: [new CamelCasePlugin()],
    });
}

/** Production client: a pg pool against the shared Postgres connection string. */
export function createAppDatabase(connectionString: string): AppDatabaseClient {
    return createAppDatabaseFromDialect(
        new PostgresDialect({
            pool: new Pool({ connectionString, max: 10 }),
        }),
    );
}

/**
 * Lazily opens the API app-tables client. Unlike the retired SQLite path, this does NOT migrate
 * on open — the shared `@budget-tools/db` migrator owns schema and runs as a one-shot step
 * before the API starts. Safe to call from request handlers.
 */
export async function getAppDatabase(): Promise<AppDatabaseClient> {
    if (!cached) {
        cached = createAppDatabase(getDbConnectionString());
    }
    return cached;
}
