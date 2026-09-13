import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { TestAppDatabase } from '../../data-persistence/testDatabase';
import { createTestAppDatabase } from '../../data-persistence/testDatabase';
import { FilesystemReceiptStorage } from '../../features/receipts/storage/filesystemReceiptStorage';
import { originalRef, processedRef } from '../../features/receipts/storage/receiptStorage';
import type { LegacyDatabase } from '../legacySqlite';
import { openLegacySqlite } from '../legacySqlite';
import { copyReceiptImages, copyTable, TABLE_PLANS } from '../migrateSqliteToPostgres';

/**
 * A throwaway SQLite database shaped like the API's retired one, so the migration script can be
 * exercised end-to-end without reading (let alone writing) the real `apps/api/data/app.sqlite`.
 * Column types match the originals: booleans as 0/1 integers, timestamps as ISO text.
 */
const LEGACY_SCHEMA = `
CREATE TABLE travel_windows (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, start_date TEXT NOT NULL,
    end_date TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, location TEXT
);
CREATE TABLE travel_window_accounts (
    window_id TEXT NOT NULL, account_id TEXT NOT NULL, account_name TEXT NOT NULL,
    PRIMARY KEY (window_id, account_id)
);
CREATE TABLE travel_bias_config (id INTEGER PRIMARY KEY, enabled INTEGER NOT NULL);
CREATE TABLE amazon_payments (
    id TEXT PRIMARY KEY, payment_date TEXT NOT NULL, amount_milliunits INTEGER NOT NULL,
    currency TEXT NOT NULL, order_ids_json TEXT NOT NULL, card_last4 TEXT, vendor TEXT,
    is_refund INTEGER NOT NULL, raw_json TEXT NOT NULL
);
CREATE TABLE amazon_orders (
    order_id TEXT PRIMARY KEY, order_date TEXT, total_milliunits INTEGER, shipping_milliunits INTEGER,
    tax_milliunits INTEGER, promotion_milliunits INTEGER, raw_json TEXT NOT NULL
);
CREATE TABLE amazon_order_items (
    id TEXT PRIMARY KEY, order_id TEXT NOT NULL, line_index INTEGER NOT NULL, asin TEXT,
    title TEXT NOT NULL, quantity INTEGER NOT NULL, item_total_milliunits INTEGER NOT NULL,
    raw_json TEXT NOT NULL
);
CREATE TABLE amazon_sync_state (
    id INTEGER PRIMARY KEY, last_auth_check TEXT, last_authenticated INTEGER NOT NULL,
    covered_ranges_json TEXT NOT NULL
);
CREATE TABLE amazon_split_overlays (
    transaction_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, overlay_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE operating_mode (id INTEGER PRIMARY KEY, mode TEXT NOT NULL);
CREATE TABLE classification_sync (
    transaction_id TEXT PRIMARY KEY, decision_json TEXT NOT NULL, status TEXT NOT NULL,
    batch_id TEXT, attempt_count INTEGER NOT NULL, last_error TEXT, created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL, synced_at TEXT, confirmed_at TEXT
);
CREATE TABLE receipts (
    id TEXT PRIMARY KEY, created_at TEXT NOT NULL, vendor TEXT, purchase_date TEXT,
    printed_milliunits INTEGER, extract_status TEXT NOT NULL, extract_json TEXT, raw_text TEXT,
    original_path TEXT NOT NULL, transaction_id TEXT, content_hash TEXT NOT NULL UNIQUE,
    totals_disagree INTEGER NOT NULL, perceptual_hash TEXT
);
`;

const WINDOW_ID = 'w-1';
const RECEIPT_ID = 'r-1';

describe('migrateSqliteToPostgres', () => {
    let harness: TestAppDatabase;
    let db: Kysely<unknown>;
    let sqlite: LegacyDatabase;
    let legacyDir: string;
    let legacyImagesDir: string;

    beforeEach(async () => {
        harness = await createTestAppDatabase();
        db = harness.db as unknown as Kysely<unknown>;

        legacyDir = await mkdtemp(join(tmpdir(), 'legacy-sqlite-'));
        legacyImagesDir = join(legacyDir, 'receipts');
        sqlite = openLegacySqlite(join(legacyDir, 'app.sqlite'));
        for (const statement of LEGACY_SCHEMA.split(';').filter((s) => s.trim())) {
            sqlite.prepare(statement).all();
        }
        seedLegacyRows(sqlite, legacyImagesDir);
        await writeLegacyImages(legacyImagesDir);
    });

    afterEach(async () => {
        sqlite.close();
        await harness.close();
        await rm(legacyDir, { recursive: true, force: true });
    });

    async function copyAllTables(dryRun = false): Promise<void> {
        for (const plan of TABLE_PLANS) {
            await copyTable(db, sqlite, plan, dryRun);
        }
    }

    it('copies every table and converts 0/1 integers into real booleans', async () => {
        await copyAllTables();

        const biasConfig = await sql<{
            enabled: boolean;
        }>`SELECT enabled FROM travel_bias_config WHERE id = 1`.execute(db);
        expect(biasConfig.rows[0]?.enabled).toBe(false);

        const payment = await sql<{
            isRefund: boolean;
        }>`SELECT is_refund FROM amazon_payments WHERE id = 'p-2'`.execute(db);
        expect(payment.rows[0]?.isRefund).toBe(true);

        const syncState = await sql<{
            lastAuthenticated: boolean;
        }>`SELECT last_authenticated FROM amazon_sync_state WHERE id = 1`.execute(db);
        expect(syncState.rows[0]?.lastAuthenticated).toBe(true);

        const receipt = await sql<{ totalsDisagree: boolean }>`SELECT totals_disagree FROM receipts`.execute(db);
        expect(receipt.rows[0]?.totalsDisagree).toBe(true);
    });

    it('converts the travel-window ISO timestamps into timestamptz', async () => {
        await copyAllTables();

        const result = await sql<{ createdAt: Date; updatedAt: Date }>`
            SELECT created_at, updated_at FROM travel_windows WHERE id = ${WINDOW_ID}
        `.execute(db);

        expect(result.rows[0]?.createdAt).toBeInstanceOf(Date);
        expect(result.rows[0]?.createdAt.toISOString()).toBe('2026-08-24T03:20:26.202Z');
        expect(result.rows[0]?.updatedAt.toISOString()).toBe('2026-08-24T03:20:26.202Z');
    });

    it('copies JSON and date columns verbatim as text', async () => {
        await copyAllTables();

        const result = await sql<{ orderIdsJson: string; paymentDate: string }>`
            SELECT order_ids_json, payment_date FROM amazon_payments WHERE id = 'p-1'
        `.execute(db);

        expect(result.rows[0]?.orderIdsJson).toBe('["o-1"]');
        expect(result.rows[0]?.paymentDate).toBe('2026-08-01');
    });

    it('overwrites the migration-seeded singleton rows with the real values', async () => {
        // The schema migration seeds operating_mode=practice and travel_bias_config.enabled=true;
        // the legacy data says live/false and must win.
        const seeded = await sql<{ mode: string }>`SELECT mode FROM operating_mode WHERE id = 1`.execute(db);
        expect(seeded.rows[0]?.mode).toBe('practice');

        await copyAllTables();

        const after = await sql<{ mode: string }>`SELECT mode FROM operating_mode WHERE id = 1`.execute(db);
        expect(after.rows[0]?.mode).toBe('live');
    });

    it('is idempotent — a second run inserts nothing new and preserves row counts', async () => {
        await copyAllTables();
        const first = await countAll(db);

        await copyAllTables();
        const second = await countAll(db);

        expect(second).toEqual(first);
    });

    it('writes nothing on a dry run', async () => {
        await copyAllTables(true);

        const result = await sql<{ count: string }>`SELECT COUNT(*) AS count FROM amazon_payments`.execute(db);
        expect(Number(result.rows[0]?.count)).toBe(0);
    });

    it('copies receipt images into the storage provider and rewrites original_path to the id', async () => {
        await copyAllTables();

        const before = await sql<{ originalPath: string }>`SELECT original_path FROM receipts`.execute(db);
        expect(before.rows[0]?.originalPath).toContain('receipts');

        await copyReceiptImages(db, sqlite, harness.storage, legacyImagesDir, false);

        expect(await harness.storage.get(originalRef(RECEIPT_ID, 0))).toEqual(Buffer.from('frame-0'));
        expect(await harness.storage.get(originalRef(RECEIPT_ID, 1))).toEqual(Buffer.from('frame-1'));
        expect(await harness.storage.get(processedRef(RECEIPT_ID))).toEqual(Buffer.from('processed'));

        const after = await sql<{ originalPath: string }>`SELECT original_path FROM receipts`.execute(db);
        expect(after.rows[0]?.originalPath).toBe(RECEIPT_ID);
    });

    it('does not re-copy receipt images that already exist in the destination', async () => {
        await copyAllTables();
        await copyReceiptImages(db, sqlite, harness.storage, legacyImagesDir, false);

        // Mutate the destination; a second run must leave it alone rather than overwrite.
        await harness.storage.put(originalRef(RECEIPT_ID, 0), Buffer.from('kept'));
        await copyReceiptImages(db, sqlite, harness.storage, legacyImagesDir, false);

        expect(await harness.storage.get(originalRef(RECEIPT_ID, 0))).toEqual(Buffer.from('kept'));
    });

    it('leaves the destination untouched when copying images as a dry run', async () => {
        await copyAllTables();
        await copyReceiptImages(db, sqlite, harness.storage, legacyImagesDir, true);

        expect(await harness.storage.exists(originalRef(RECEIPT_ID, 0))).toBe(false);
        const after = await sql<{ originalPath: string }>`SELECT original_path FROM receipts`.execute(db);
        expect(after.rows[0]?.originalPath).not.toBe(RECEIPT_ID);
    });
});

/** Writes the legacy on-disk layout: `{id}` (frame 0), `{id}.1` (frame 1), `{id}.processed`. */
async function writeLegacyImages(imagesDir: string): Promise<void> {
    const storage = new FilesystemReceiptStorage(imagesDir);
    await storage.put(originalRef(RECEIPT_ID, 0), Buffer.from('frame-0'));
    await storage.put(originalRef(RECEIPT_ID, 1), Buffer.from('frame-1'));
    await storage.put(processedRef(RECEIPT_ID), Buffer.from('processed'));
}

async function countAll(db: Kysely<unknown>): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const plan of TABLE_PLANS) {
        const result = await sql<{ count: string }>`SELECT COUNT(*) AS count FROM ${sql.ref(plan.table)}`.execute(db);
        counts[plan.table] = Number(result.rows[0]?.count ?? 0);
    }
    return counts;
}

function seedLegacyRows(sqlite: LegacyDatabase, imagesDir: string): void {
    sqlite
        .prepare(
            `INSERT INTO travel_windows (id, name, kind, start_date, end_date, created_at, updated_at, location)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .all(
            WINDOW_ID,
            'Trip',
            'vacation',
            '2026-08-24',
            '2026-08-30',
            '2026-08-24T03:20:26.202Z',
            '2026-08-24T03:20:26.202Z',
            'Lisbon',
        );
    sqlite
        .prepare('INSERT INTO travel_window_accounts (window_id, account_id, account_name) VALUES (?, ?, ?)')
        .all(WINDOW_ID, 'a-1', 'Checking');
    // Deliberately `false` so it must overwrite the migration's `true` default.
    sqlite.prepare('INSERT INTO travel_bias_config (id, enabled) VALUES (1, 0)').all();

    const payment = sqlite.prepare(
        `INSERT INTO amazon_payments
         (id, payment_date, amount_milliunits, currency, order_ids_json, card_last4, vendor, is_refund, raw_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    payment.all('p-1', '2026-08-01', -12340, 'USD', '["o-1"]', '4321', 'Amazon', 0, '{}');
    payment.all('p-2', '2026-08-02', 500, 'USD', '["o-1"]', null, null, 1, '{}');

    sqlite
        .prepare(
            `INSERT INTO amazon_orders
             (order_id, order_date, total_milliunits, shipping_milliunits, tax_milliunits, promotion_milliunits, raw_json)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .all('o-1', '2026-08-01', -12340, 0, -1000, 0, '{}');
    sqlite
        .prepare(
            `INSERT INTO amazon_order_items
             (id, order_id, line_index, asin, title, quantity, item_total_milliunits, raw_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .all('i-1', 'o-1', 0, 'ASIN1', 'Widget', 1, -12340, '{}');

    sqlite
        .prepare(
            `INSERT INTO amazon_sync_state (id, last_auth_check, last_authenticated, covered_ranges_json)
             VALUES (1, ?, 1, ?)`,
        )
        .all('2026-08-27T06:53:45.744Z', '[]');
    sqlite
        .prepare(
            'INSERT INTO amazon_split_overlays (transaction_id, fingerprint, overlay_json, updated_at) VALUES (?, ?, ?, ?)',
        )
        .all('t-1', 'fp', '{}', '2026-08-27T06:53:45.744Z');
    // Deliberately `live` so it must overwrite the migration's `practice` default.
    sqlite.prepare("INSERT INTO operating_mode (id, mode) VALUES (1, 'live')").all();
    sqlite
        .prepare(
            `INSERT INTO classification_sync
             (transaction_id, decision_json, status, batch_id, attempt_count, last_error, created_at, updated_at, synced_at, confirmed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .all('t-1', '{}', 'pending', null, 0, null, '2026-08-27T06:53:45.744Z', '2026-08-27T06:53:45.744Z', null, null);

    sqlite
        .prepare(
            `INSERT INTO receipts
             (id, created_at, vendor, purchase_date, printed_milliunits, extract_status, extract_json, raw_text,
              original_path, transaction_id, content_hash, totals_disagree, perceptual_hash)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .all(
            RECEIPT_ID,
            '2026-09-03T01:14:00.000Z',
            'Grocer',
            '2026-09-02',
            -4599,
            'ungated',
            '{}',
            'text',
            join(imagesDir, RECEIPT_ID),
            null,
            'hash-1',
            1,
            'phash-1',
        );
}
