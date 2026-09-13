/**
 * One-time (re-runnable) data migration: the API's retired SQLite database → the shared Postgres.
 *
 * Phase 1 moved the API's *schema* into `@budget-tools/db`; this script moves the *rows*. Run it
 * once against production after the migrator has created the tables, and locally whenever you want
 * to re-seed a fresh Postgres from the SQLite snapshot.
 *
 * Safe to run repeatedly: every table upserts on its primary key, so an interrupted run can simply
 * be re-run. The SQLite file is opened READ-ONLY and is never written, moved, or deleted.
 *
 * Receipt images are copied through the configured `ReceiptStorage` provider, so the destination
 * follows `RECEIPTS_STORAGE` (`fs` locally, `s3` for rust-fs in production). That means you can
 * migrate rows to filesystem storage now and re-run later with `RECEIPTS_STORAGE=s3` to move the
 * images, with no changes here — objects already present in the destination are skipped.
 *
 * Usage:
 *   DB_CONNECTION_STRING=postgres://... pnpm --filter @budget-tools/api migrate:data [-- options]
 *
 * Options:
 *   --sqlite <path>   Source database (default: apps/api/data/app.sqlite, repo-root relative)
 *   --images <dir>    Where the legacy receipt images live. Defaults to the directory recorded in
 *                     `receipts.original_path`, falling back to the configured receipts dir.
 *   --skip-images     Migrate rows only; leave receipt images alone.
 *   --dry-run         Report what would be written without writing anything.
 */

import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Kysely } from 'kysely';
import { sql } from 'kysely';

import { createAppDatabase } from '../data-persistence/database';
import { getDbConnectionString, getReceiptsDir } from '../environment';
import { FilesystemReceiptStorage } from '../features/receipts/storage/filesystemReceiptStorage';
import { getReceiptStorage } from '../features/receipts/storage/getReceiptStorage';
import type { ReceiptStorage } from '../features/receipts/storage/receiptStorage';
import { originalRef, processedRef } from '../features/receipts/storage/receiptStorage';
import type { LegacyDatabase } from './legacySqlite';
import { openLegacySqlite } from './legacySqlite';

/** Rows per multi-row INSERT. Keeps the widest table well under Postgres' 65535 bind-param cap. */
const BATCH_ROWS = 250;

/**
 * Per-table copy plan. `columns` is the exact snake_case column list, identical in both databases.
 * `booleans` names the columns SQLite stored as 0/1 integers that Postgres now declares `boolean`;
 * `timestamps` names the columns SQLite stored as ISO text that Postgres now declares `timestamptz`.
 * Everything else — including all `*_json` columns and the other ISO date columns, which remain
 * `text` — is copied verbatim.
 *
 * Order matters: parents before children, so an interrupted run never leaves danglers.
 */
export type TablePlan = {
    readonly table: string;
    readonly columns: readonly string[];
    readonly conflictColumns: readonly string[];
    readonly booleans?: readonly string[];
    readonly timestamps?: readonly string[];
    /** Singleton config rows the schema migration already seeds — real data must overwrite them. */
    readonly overwriteOnConflict?: boolean;
};

export const TABLE_PLANS: readonly TablePlan[] = [
    {
        table: 'travel_windows',
        columns: ['id', 'name', 'kind', 'start_date', 'end_date', 'location', 'created_at', 'updated_at'],
        conflictColumns: ['id'],
        timestamps: ['created_at', 'updated_at'],
    },
    {
        table: 'travel_window_accounts',
        columns: ['window_id', 'account_id', 'account_name'],
        conflictColumns: ['window_id', 'account_id'],
    },
    {
        table: 'travel_bias_config',
        columns: ['id', 'enabled'],
        conflictColumns: ['id'],
        booleans: ['enabled'],
        overwriteOnConflict: true,
    },
    {
        table: 'amazon_payments',
        columns: [
            'id',
            'payment_date',
            'amount_milliunits',
            'currency',
            'order_ids_json',
            'card_last4',
            'vendor',
            'is_refund',
            'raw_json',
        ],
        conflictColumns: ['id'],
        booleans: ['is_refund'],
    },
    {
        table: 'amazon_orders',
        columns: [
            'order_id',
            'order_date',
            'total_milliunits',
            'shipping_milliunits',
            'tax_milliunits',
            'promotion_milliunits',
            'raw_json',
        ],
        conflictColumns: ['order_id'],
    },
    {
        table: 'amazon_order_items',
        columns: ['id', 'order_id', 'line_index', 'asin', 'title', 'quantity', 'item_total_milliunits', 'raw_json'],
        conflictColumns: ['id'],
    },
    {
        table: 'amazon_sync_state',
        columns: ['id', 'last_auth_check', 'last_authenticated', 'covered_ranges_json'],
        conflictColumns: ['id'],
        booleans: ['last_authenticated'],
        overwriteOnConflict: true,
    },
    {
        table: 'amazon_split_overlays',
        columns: ['transaction_id', 'fingerprint', 'overlay_json', 'updated_at'],
        conflictColumns: ['transaction_id'],
    },
    {
        table: 'operating_mode',
        columns: ['id', 'mode'],
        conflictColumns: ['id'],
        overwriteOnConflict: true,
    },
    {
        table: 'classification_sync',
        columns: [
            'transaction_id',
            'decision_json',
            'status',
            'batch_id',
            'attempt_count',
            'last_error',
            'created_at',
            'updated_at',
            'synced_at',
            'confirmed_at',
        ],
        conflictColumns: ['transaction_id'],
    },
    {
        table: 'receipts',
        columns: [
            'id',
            'created_at',
            'vendor',
            'purchase_date',
            'printed_milliunits',
            'extract_status',
            'extract_json',
            'raw_text',
            'original_path',
            'transaction_id',
            'content_hash',
            'perceptual_hash',
            'totals_disagree',
        ],
        conflictColumns: ['id'],
        booleans: ['totals_disagree'],
    },
];

type Options = {
    readonly sqlitePath: string;
    readonly imagesDir: string | undefined;
    readonly skipImages: boolean;
    readonly dryRun: boolean;
};

function parseArgs(argv: readonly string[]): Options {
    let sqlitePath = 'apps/api/data/app.sqlite';
    let imagesDir: string | undefined;
    let skipImages = false;
    let dryRun = false;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--sqlite') {
            sqlitePath = requireValue(argv[index + 1], '--sqlite');
            index += 1;
        } else if (arg === '--images') {
            imagesDir = requireValue(argv[index + 1], '--images');
            index += 1;
        } else if (arg === '--skip-images') {
            skipImages = true;
        } else if (arg === '--dry-run') {
            dryRun = true;
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return { sqlitePath: resolve(sqlitePath), imagesDir, skipImages, dryRun };
}

function requireValue(value: string | undefined, flag: string): string {
    if (!value || value.startsWith('--')) {
        throw new Error(`${flag} requires a value`);
    }
    return value;
}

/** Converts one SQLite cell into the value Postgres expects for that column. */
function convert(column: string, value: unknown, plan: TablePlan): unknown {
    if (value === null || value === undefined) {
        return null;
    }
    if (plan.booleans?.includes(column)) {
        // SQLite stored these as 0/1 integers; Postgres now declares them `boolean`.
        return value !== 0 && value !== '0';
    }
    if (plan.timestamps?.includes(column)) {
        // ISO-8601 text → a real Date so `pg` binds it as `timestamptz`.
        const parsed = new Date(String(value));
        if (Number.isNaN(parsed.getTime())) {
            throw new Error(`${plan.table}.${column}: cannot parse timestamp ${JSON.stringify(value)}`);
        }
        return parsed;
    }
    return value;
}

/**
 * Upserts one table's rows. Uses raw SQL with an explicit column list rather than the typed query
 * builder: the source rows are dynamic snake_case records, and the app client's CamelCasePlugin
 * would otherwise rewrite the identifiers we have deliberately matched by hand.
 */
export async function copyTable(
    db: Kysely<unknown>,
    sqlite: LegacyDatabase,
    plan: TablePlan,
    dryRun: boolean,
): Promise<{ source: number; written: number }> {
    const selectColumns = plan.columns.map((column) => `"${column}"`).join(', ');
    const rows = sqlite.prepare(`SELECT ${selectColumns} FROM "${plan.table}"`).all() as Record<string, unknown>[];

    if (rows.length === 0 || dryRun) {
        return { source: rows.length, written: 0 };
    }

    const columnList = plan.columns.map((column) => sql.ref(column));
    const conflictTarget = plan.conflictColumns.map((column) => sql.ref(column));
    const updatable = plan.columns.filter((column) => !plan.conflictColumns.includes(column));
    const onConflict =
        plan.overwriteOnConflict && updatable.length > 0
            ? sql`DO UPDATE SET ${sql.join(
                  updatable.map((column) => sql`${sql.ref(column)} = EXCLUDED.${sql.ref(column)}`),
              )}`
            : sql`DO NOTHING`;

    let written = 0;
    for (let offset = 0; offset < rows.length; offset += BATCH_ROWS) {
        const batch = rows.slice(offset, offset + BATCH_ROWS);
        const values = batch.map(
            (row) => sql`(${sql.join(plan.columns.map((column) => sql`${convert(column, row[column], plan)}`))})`,
        );

        const result = await sql`
            INSERT INTO ${sql.ref(plan.table)} (${sql.join(columnList)})
            VALUES ${sql.join(values)}
            ON CONFLICT (${sql.join(conflictTarget)}) ${onConflict}
        `.execute(db);

        written += Number(result.numAffectedRows ?? 0n);
    }

    return { source: rows.length, written };
}

async function countRows(db: Kysely<unknown>, table: string): Promise<string> {
    const result = await sql<{ count: string | number }>`SELECT COUNT(*) AS count FROM ${sql.ref(table)}`.execute(db);
    return String(result.rows[0]?.count ?? '?');
}

/**
 * Resolves where the legacy receipt images live. Historically `receipts.original_path` held an
 * absolute path to the frame-0 file, so its directory is the most reliable source; the configured
 * receipts dir is the fallback for rows whose path is missing or already rewritten.
 */
function resolveImagesDir(rows: readonly { original_path: string | null }[], override: string | undefined): string {
    if (override) {
        return resolve(override);
    }
    const recorded = rows
        .map((row) => row.original_path)
        .find((path): path is string => typeof path === 'string' && isAbsolute(path));
    return recorded ? dirname(recorded) : resolve(getReceiptsDir());
}

/**
 * Copies each receipt's images (frame 0, any extra frames, processed) from the legacy directory
 * into the configured storage provider, then rewrites `receipts.original_path` to the receipt id —
 * the logical storage key the repository now uses. Objects already present in the destination are
 * left alone, which is what makes a re-run cheap.
 */
export async function copyReceiptImages(
    db: Kysely<unknown>,
    sqlite: LegacyDatabase,
    destination: ReceiptStorage,
    imagesDirOverride: string | undefined,
    dryRun: boolean,
): Promise<void> {
    const rows = sqlite.prepare('SELECT id, original_path FROM receipts').all() as {
        id: string;
        original_path: string | null;
    }[];

    if (rows.length === 0) {
        console.log('no receipts to copy');
        return;
    }

    const imagesDir = resolveImagesDir(rows, imagesDirOverride);
    const source = new FilesystemReceiptStorage(imagesDir);
    console.log(`reading images from ${imagesDir}`);

    let copied = 0;
    let skipped = 0;
    const missing: string[] = [];

    for (const row of rows) {
        const frames = await source.countFrames(row.id);
        if (frames === 0) {
            missing.push(row.id);
        }

        const refs = [
            ...Array.from({ length: frames }, (_unused, frameIndex) => originalRef(row.id, frameIndex)),
            processedRef(row.id),
        ];

        for (const ref of refs) {
            if (!(await source.exists(ref))) {
                continue;
            }
            if (await destination.exists(ref)) {
                skipped += 1;
                continue;
            }
            const bytes = await source.get(ref);
            if (!bytes) {
                continue;
            }
            if (!dryRun) {
                await destination.put(ref, bytes);
            }
            copied += 1;
        }
    }

    console.log(`images: ${copied} ${dryRun ? 'would be copied' : 'copied'}, ${skipped} already present`);
    if (missing.length > 0) {
        console.warn(`WARNING: no image files found for ${missing.length} receipt(s): ${missing.join(', ')}`);
    }

    if (!dryRun) {
        // `original_path` is now the logical storage key, not a filesystem path.
        const result = await sql`UPDATE receipts SET original_path = id WHERE original_path <> id`.execute(db);
        console.log(`original_path: ${Number(result.numAffectedRows ?? 0n)} row(s) rewritten to the receipt id`);
    }
}

async function main(): Promise<void> {
    const options = parseArgs(process.argv.slice(2));

    if (options.dryRun) {
        console.log('DRY RUN — no writes will be performed\n');
    }
    console.log(`source: ${options.sqlitePath}`);

    const sqlite = openLegacySqlite(options.sqlitePath, { readOnly: true });
    const db = createAppDatabase(getDbConnectionString()) as unknown as Kysely<unknown>;

    try {
        console.log('\n--- tables ---');
        for (const plan of TABLE_PLANS) {
            const { source, written } = await copyTable(db, sqlite, plan, options.dryRun);
            const after = options.dryRun ? '(dry run)' : await countRows(db, plan.table);
            console.log(
                `${plan.table.padEnd(24)} sqlite=${String(source).padStart(5)}` +
                    `  inserted=${String(written).padStart(5)}  postgres=${after}`,
            );
        }

        console.log('\n--- receipt images ---');
        if (options.skipImages) {
            console.log('skipped (--skip-images)');
        } else {
            await copyReceiptImages(db, sqlite, getReceiptStorage(), options.imagesDir, options.dryRun);
        }

        console.log('\nDone.');
    } finally {
        sqlite.close();
        await db.destroy();
    }
}

// Only run when invoked directly (`tsx .../migrateSqliteToPostgres.ts`), so tests can import the
// copy functions and drive them against an in-process PGlite database.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error: unknown) => {
        console.error(error);
        process.exit(1);
    });
}
