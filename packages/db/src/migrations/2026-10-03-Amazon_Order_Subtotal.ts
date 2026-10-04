import type { Kysely } from 'kysely';

/**
 * Amazon's own "Item(s) Subtotal" for an order, from amazon-sync.
 *
 * Lets the completeness check compare line items against the figure they should add up
 * to (exact on every order checked), instead of against the grand total, which includes
 * tax and so made any order with more than $5 of tax look incomplete forever.
 * Null for orders fetched by the legacy MCP, which never reported it.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('amazon_orders')
        .addColumn('subtotal_milliunits', 'integer', (col) => col.ifNotExists())
        .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('amazon_orders').dropColumn('subtotal_milliunits').execute();
}
