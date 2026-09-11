import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('receipts').addColumn('perceptual_hash', 'text').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('receipts').dropColumn('perceptual_hash').execute();
}
