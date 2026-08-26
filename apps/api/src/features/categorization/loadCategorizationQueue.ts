import {
    CATEGORIZATION_MODELS_DIR,
    CATEGORIZATION_QUEUE_BATCH_SIZE,
    CATEGORIZATION_QUEUE_CACHE_DIR,
} from '../../environment';
import { loadTravelWindowsSignature } from '../travelWindows/travelWindowsStore';
import {
    cacheEntriesMap,
    cacheFilePath,
    isCacheUsable,
    modelSignature,
    readProposalCache,
} from './cache/proposalCache';
import { selectScoringBatch } from './cache/selectScoringBatch';
import { collectValidCacheEntries, selectWindowSlice } from './cache/selectWindowSlice';
import type { CachedProposalEntry } from './cache/types';
import type { CategorizationProposalDto, CategorizationQueueDto, CategorizationQueueQuery } from './categorizationDtos';
import { filterAndSortQueueItems, parseTierFilter } from './filterQueue';
import { hydrateRelatedTransactions } from './hydrateRelatedTransactions';
import { joinQueueItems } from './joinQueueItems';
import type { PendingTransactionRow } from './listPendingTransactions';
import { listPendingTransactions } from './listPendingTransactions';
import { assertCategorizationModelsExist } from './predictJson';
import { latestGeneratedAt, scoreMissingIds, withScoreLock } from './scoreProposals';
import { summarizeQueue } from './summarizeQueue';
import { transactionMatchesQuery } from './transactionMatchesQuery';

type QueueSnapshot = {
    generatedAt: string;
    pendingCount: number;
    scoredCount: number;
    hasMoreNewer: boolean;
    hasMoreOlder: boolean;
    items: Awaited<ReturnType<typeof hydrateRelatedTransactions>>;
};

type WindowQuery = {
    around?: string;
    olderThan?: string;
    newerThan?: string;
};

/**
 * Returns the review queue: pending transactions joined to cached proposals.
 * Window queries list without spawning; the review-list path scores a batch.
 */
export async function loadCategorizationQueue(query: CategorizationQueueQuery): Promise<CategorizationQueueDto> {
    const refresh = query.refresh === true;
    const expand = query.expand === true && !refresh;
    const windowQuery = refresh ? undefined : readWindowQuery(query);
    const snapshot = windowQuery
        ? await loadWindowSnapshot(windowQuery, query.q)
        : await loadScoredSnapshot(refresh, expand, query.q);
    const filteredItems = filterAndSortQueueItems(snapshot.items, {
        tiers: parseTierFilter(query.tier),
        accountId: query.accountId,
        q: query.q,
    });

    return {
        summary: summarizeQueue(proposalsFromItems(snapshot.items)),
        generatedAt: snapshot.generatedAt,
        llm: false,
        pendingCount: snapshot.pendingCount,
        scoredCount: snapshot.scoredCount,
        hasMore: snapshot.hasMoreOlder,
        hasMoreNewer: snapshot.hasMoreNewer,
        hasMoreOlder: snapshot.hasMoreOlder,
        items: filteredItems,
    };
}

function readWindowQuery(query: CategorizationQueueQuery): WindowQuery | undefined {
    if (query.olderThan || query.newerThan || query.around) {
        return {
            around: query.around,
            olderThan: query.olderThan,
            newerThan: query.newerThan,
        };
    }
    return undefined;
}

function proposalsFromItems(items: QueueSnapshot['items']): CategorizationProposalDto[] {
    const proposals: CategorizationProposalDto[] = [];
    for (const item of items) {
        if (item.proposal) {
            proposals.push(item.proposal);
        }
    }
    return proposals;
}

/**
 * Classify window: pending rows plus cache hits. Does not spawn predict-json
 * and does not wait on an in-flight score.
 */
async function loadWindowSnapshot(windowQuery: WindowQuery, q: string | undefined): Promise<QueueSnapshot> {
    const listed = await listPendingTransactions();
    const pending = pendingMatchingQuery(listed, q);
    const pendingIds = pending.map((row) => row.id);
    const signature = modelSignature(CATEGORIZATION_MODELS_DIR);
    const travelSignature = await loadTravelWindowsSignature();
    const path = cacheFilePath(CATEGORIZATION_QUEUE_CACHE_DIR, false);
    const cache = await readProposalCache(path);
    const fingerprints = new Map(pending.map((row) => [row.id, row.fingerprint]));
    const cacheUsable = isCacheUsable(cache, false, signature, travelSignature);
    const kept = collectValidCacheEntries({
        pendingIds,
        fingerprints,
        cacheEntries: cacheEntriesMap(cache),
        cacheUsable,
    });
    const slice = selectWindowSlice({
        pendingIds,
        batchSize: CATEGORIZATION_QUEUE_BATCH_SIZE,
        around: windowQuery.around,
        olderThan: windowQuery.olderThan,
        newerThan: windowQuery.newerThan,
    });
    const proposalsById = proposalsMap(kept);
    const scoredItems = joinQueueItems({
        pending,
        proposalsById,
        sliceIds: new Set(slice.ids),
        requireProposal: false,
    });
    const items = await hydrateRelatedTransactions(scoredItems);
    const scoredInWindow = items.filter((item) => item.proposal).length;

    return {
        generatedAt: latestGeneratedAt(kept) ?? new Date().toISOString(),
        pendingCount: listed.length,
        scoredCount: scoredInWindow,
        hasMoreNewer: slice.startIndex > 0,
        hasMoreOlder: slice.endIndexExclusive < pending.length,
        items,
    };
}

async function loadScoredSnapshot(refresh: boolean, expand: boolean, q: string | undefined): Promise<QueueSnapshot> {
    return withScoreLock(() => loadScoredSnapshotLocked(refresh, expand, q));
}

async function loadScoredSnapshotLocked(
    refresh: boolean,
    expand: boolean,
    q: string | undefined,
): Promise<QueueSnapshot> {
    assertCategorizationModelsExist(CATEGORIZATION_MODELS_DIR);

    const listed = await listPendingTransactions();
    const pending = pendingMatchingQuery(listed, q);
    const pendingIds = pending.map((row) => row.id);
    const signature = modelSignature(CATEGORIZATION_MODELS_DIR);
    const travelSignature = await loadTravelWindowsSignature();
    const path = cacheFilePath(CATEGORIZATION_QUEUE_CACHE_DIR, false);
    const cache = await readProposalCache(path);
    const fingerprints = new Map(pending.map((row) => [row.id, row.fingerprint]));
    const cacheEntries = cacheEntriesMap(cache);
    const cacheUsable = isCacheUsable(cache, false, signature, travelSignature);

    const batch = selectScoringBatch({
        pendingIds,
        fingerprints,
        cacheEntries,
        cacheUsable,
        batchSize: CATEGORIZATION_QUEUE_BATCH_SIZE,
        refresh,
        expand,
    });

    const scored = await scoreMissingIds({
        idsToScore: batch.idsToScore,
        fingerprints,
        kept: batch.kept,
        cache,
        signature,
        travelSignature,
        cachePath: path,
    });

    const proposalsById = proposalsMap(scored.kept);
    const scoredItems = joinQueueItems({
        pending,
        proposalsById,
        requireProposal: true,
    });
    const items = await hydrateRelatedTransactions(scoredItems);

    return {
        generatedAt: scored.generatedAt,
        pendingCount: listed.length,
        scoredCount: items.length,
        hasMoreNewer: false,
        hasMoreOlder: pending.length > items.length,
        items,
    };
}

function pendingMatchingQuery(
    pending: readonly PendingTransactionRow[],
    q: string | undefined,
): PendingTransactionRow[] {
    if (!q?.trim()) {
        return [...pending];
    }
    return pending.filter((row) => transactionMatchesQuery(row, q));
}

function proposalsMap(entries: readonly CachedProposalEntry[]): Map<string, CategorizationProposalDto> {
    return new Map(entries.map((entry) => [entry.proposal.transactionId, entry.proposal]));
}
