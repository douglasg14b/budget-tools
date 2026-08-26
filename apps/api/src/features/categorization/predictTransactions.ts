import { CATEGORIZATION_MODELS_DIR, CATEGORIZATION_QUEUE_CACHE_DIR } from '../../environment';
import { HttpError, NotFoundError } from '../travelWindows/HttpError';
import { loadTravelWindowsSignature } from '../travelWindows/travelWindowsStore';
import {
    cacheEntriesMap,
    cacheFilePath,
    isCacheUsable,
    modelSignature,
    readProposalCache,
} from './cache/proposalCache';
import { collectValidCacheEntries } from './cache/selectWindowSlice';
import type { CachedProposalEntry } from './cache/types';
import type {
    CategorizationPredictDto,
    CategorizationPredictRequestDto,
    CategorizationProposalDto,
} from './categorizationDtos';
import { hydrateRelatedTransactions } from './hydrateRelatedTransactions';
import { joinQueueItems } from './joinQueueItems';
import { listPendingTransactions } from './listPendingTransactions';
import { assertCategorizationModelsExist } from './predictJson';
import { scoreMissingIds, withScoreLock } from './scoreProposals';

export const PREDICT_MAX_IDS = 25;

/**
 * Scores the given pending transaction ids (cache misses only) and returns hydrated queue items.
 */
export async function predictTransactions(body: CategorizationPredictRequestDto): Promise<CategorizationPredictDto> {
    const requestedIds = parsePredictRequest(body.transactionIds);
    return withScoreLock(() => predictTransactionsLocked(requestedIds));
}

export function parsePredictRequest(transactionIds: readonly string[] | undefined): string[] {
    if (!transactionIds || transactionIds.length === 0) {
        throw new HttpError(422, 'transactionIds is required');
    }
    if (transactionIds.length > PREDICT_MAX_IDS) {
        throw new HttpError(422, `transactionIds cannot exceed ${PREDICT_MAX_IDS}`);
    }

    const unique: string[] = [];
    const seen = new Set<string>();
    for (const transactionId of transactionIds) {
        const trimmed = transactionId.trim();
        if (!trimmed) {
            throw new HttpError(422, 'transactionIds must not contain blank ids');
        }
        if (seen.has(trimmed)) {
            continue;
        }
        seen.add(trimmed);
        unique.push(trimmed);
    }
    return unique;
}

export function assertAllPending(requestedIds: readonly string[], pendingIds: ReadonlySet<string>): void {
    for (const transactionId of requestedIds) {
        if (!pendingIds.has(transactionId)) {
            throw new NotFoundError(`Pending transaction ${transactionId} was not found`);
        }
    }
}

export function selectPredictIdsToScore(
    requestedIds: readonly string[],
    kept: readonly CachedProposalEntry[],
): string[] {
    const keptIds = new Set(kept.map((entry) => entry.proposal.transactionId));
    return requestedIds.filter((transactionId) => !keptIds.has(transactionId));
}

async function predictTransactionsLocked(requestedIds: readonly string[]): Promise<CategorizationPredictDto> {
    assertCategorizationModelsExist(CATEGORIZATION_MODELS_DIR);

    const pending = await listPendingTransactions();
    const pendingIds = new Set(pending.map((row) => row.id));
    assertAllPending(requestedIds, pendingIds);

    const signature = modelSignature(CATEGORIZATION_MODELS_DIR);
    const travelSignature = await loadTravelWindowsSignature();
    const path = cacheFilePath(CATEGORIZATION_QUEUE_CACHE_DIR, false);
    const cache = await readProposalCache(path);
    const fingerprints = new Map(pending.map((row) => [row.id, row.fingerprint]));
    const cacheUsable = isCacheUsable(cache, false, signature, travelSignature);
    const kept = collectValidCacheEntries({
        pendingIds: pending.map((row) => row.id),
        fingerprints,
        cacheEntries: cacheEntriesMap(cache),
        cacheUsable,
    });
    const idsToScore = selectPredictIdsToScore(requestedIds, kept);

    const scored = await scoreMissingIds({
        idsToScore,
        fingerprints,
        kept,
        cache,
        signature,
        travelSignature,
        cachePath: path,
    });

    const requested = new Set(requestedIds);
    const proposalsById = new Map<string, CategorizationProposalDto>(
        scored.kept
            .filter((entry) => requested.has(entry.proposal.transactionId))
            .map((entry) => [entry.proposal.transactionId, entry.proposal]),
    );
    const joined = joinQueueItems({
        pending: pending.filter((row) => requested.has(row.id)),
        proposalsById,
        requireProposal: true,
    });
    const items = await hydrateRelatedTransactions(joined);

    return {
        generatedAt: scored.generatedAt,
        items,
    };
}
