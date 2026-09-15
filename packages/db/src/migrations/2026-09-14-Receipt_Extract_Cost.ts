import type { Kysely } from 'kysely';

/**
 * Persists OpenRouter inference cost for the two vision calls (header pass + line-item pass)
 * an extract makes per receipt, summed into one total. Lets "$/receipt" be answered with a
 * query instead of grepping the `logLlmSuggest('inference cost', ...)` log lines.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .alterTable('receipts')
        .addColumn('extract_cost_usd', 'double precision', (col) => col.ifNotExists())
        .execute();
    await db.schema
        .alterTable('receipts')
        .addColumn('extract_prompt_tokens', 'integer', (col) => col.ifNotExists())
        .execute();
    await db.schema
        .alterTable('receipts')
        .addColumn('extract_completion_tokens', 'integer', (col) => col.ifNotExists())
        .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('receipts').dropColumn('extract_completion_tokens').execute();
    await db.schema.alterTable('receipts').dropColumn('extract_prompt_tokens').execute();
    await db.schema.alterTable('receipts').dropColumn('extract_cost_usd').execute();
}
