import { CATEGORIZATION_MODELS_DIR, CATEGORIZATION_QUEUE_CACHE_DIR } from '../../../environment';
import { loadTravelWindowsSignature } from '../../travelWindows/travelWindowsStore';
import { cacheFilePath, isCacheUsable, modelSignature, readProposalCache } from '../cache/proposalCache';
import type { CategorizationProposalDto, TransactionDetailDto } from '../categorizationDtos';
import { listPendingTransactions, toTransactionDetail } from '../listPendingTransactions';
import { LlmSuggestError } from './LlmSuggestError';

export type ScoredQueueItem = {
    readonly fingerprint: string;
    readonly proposal: CategorizationProposalDto;
    readonly transaction: TransactionDetailDto;
};

/**
 * Loads a locally scored queue item. 404 when the transaction is not in the current working set.
 */
export async function getScoredQueueItem(transactionId: string): Promise<ScoredQueueItem> {
    const pending = await listPendingTransactions();
    const row = pending.find((item) => item.id === transactionId);
    if (!row) {
        throw new LlmSuggestError(404, `Pending transaction ${transactionId} was not found`);
    }

    const signature = modelSignature(CATEGORIZATION_MODELS_DIR);
    const travelSignature = await loadTravelWindowsSignature();
    const cache = await readProposalCache(cacheFilePath(CATEGORIZATION_QUEUE_CACHE_DIR, false));
    if (!isCacheUsable(cache, false, signature, travelSignature)) {
        throw new LlmSuggestError(404, `Transaction ${transactionId} is not in the scored queue`);
    }

    const entry = cache.entries[transactionId];
    if (!entry || entry.fingerprint !== row.fingerprint) {
        throw new LlmSuggestError(404, `Transaction ${transactionId} is not in the scored queue`);
    }

    return {
        fingerprint: row.fingerprint,
        proposal: entry.proposal,
        transaction: toTransactionDetail(row),
    };
}
