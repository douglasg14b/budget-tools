import type { Kysely } from 'kysely';

/**
 * Records how each receipt came to be bound and what the background binder last
 * concluded, so auto-binds can be told apart from human ones and measured later.
 *
 * - `bind_source`: `capture` (photographed from a transaction), `manual`, or `auto`.
 * - `bind_jev_score`: Jev `same_purchase` probability behind an `auto` bind.
 * - `bind_checked_at` / `bind_check_outcome`: last auto-bind attempt on an unbound receipt.
 * - `receipt_bind_rejections`: charges a person detached from a receipt; the binder
 *   never offers that pair again.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('receipts')
        .addColumn('bind_source', 'text', (col) => col.ifNotExists())
        .execute();
    await db.schema
        .alterTable('receipts')
        .addColumn('bound_at', 'text', (col) => col.ifNotExists())
        .execute();
    await db.schema
        .alterTable('receipts')
        .addColumn('bind_jev_score', 'double precision', (col) => col.ifNotExists())
        .execute();
    await db.schema
        .alterTable('receipts')
        .addColumn('bind_checked_at', 'text', (col) => col.ifNotExists())
        .execute();
    await db.schema
        .alterTable('receipts')
        .addColumn('bind_check_outcome', 'text', (col) => col.ifNotExists())
        .execute();

    await db.schema
        .createTable('receipt_bind_rejections')
        .ifNotExists()
        .addColumn('receipt_id', 'text', (col) => col.notNull())
        .addColumn('transaction_id', 'text', (col) => col.notNull())
        .addColumn('created_at', 'text', (col) => col.notNull())
        .addPrimaryKeyConstraint('receipt_bind_rejections_pk', ['receipt_id', 'transaction_id'])
        .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('receipt_bind_rejections').ifExists().execute();
    await db.schema.alterTable('receipts').dropColumn('bind_check_outcome').execute();
    await db.schema.alterTable('receipts').dropColumn('bind_checked_at').execute();
    await db.schema.alterTable('receipts').dropColumn('bind_jev_score').execute();
    await db.schema.alterTable('receipts').dropColumn('bound_at').execute();
    await db.schema.alterTable('receipts').dropColumn('bind_source').execute();
}
