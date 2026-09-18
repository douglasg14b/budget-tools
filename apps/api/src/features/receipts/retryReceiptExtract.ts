import type { AppDatabaseClient } from '../../data-persistence/database';
import type { ReceiptRow } from './data/receiptsRepo';
import { resetFailedReceiptExtract } from './data/receiptsRepo';

/**
 * Moves a failed receipt back to pending. The caller is responsible for enqueueing
 * the returned row after the database state is durable.
 */
export async function retryReceiptExtract(id: string, db?: AppDatabaseClient): Promise<ReceiptRow> {
    return resetFailedReceiptExtract(id, db);
}
