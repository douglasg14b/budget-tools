import {
    CATEGORIZATION_AI_WORKING_DIR,
    CATEGORIZATION_MODELS_DIR,
    CATEGORIZATION_PREDICT_TIMEOUT_MS,
    CATEGORIZATION_QUEUE_BATCH_SIZE,
    CATEGORIZATION_QUEUE_CACHE_DIR,
    getDbConnectionString,
    getSqliteDbPath,
} from '../../environment';
import { loadTravelWindowsSignature } from '../travelWindows/travelWindowsStore';
import {
    cacheEntriesMap,
    cacheFilePath,
    isCacheUsable,
    modelSignature,
    readProposalCache,
    writeProposalCache,
} from './cache/proposalCache';
import { selectScoringBatch } from './cache/selectScoringBatch';
import { selectWindowScoring } from './cache/selectWindowSlice';
import type { CachedProposalEntry, ProposalCacheFile } from './cache/types';
import type {
    CategorizationQueueDto,
    CategorizationQueueItemDto,
    CategorizationQueueQuery,
} from './categorizationDtos';
import { filterAndSortQueueItems, parseTierFilter } from './filterQueue';
import { hydrateRelatedTransactions } from './hydrateRelatedTransactions';
import { listPendingTransactions, toTransactionDetail } from './listPendingTransactions';
import { assertCategorizationModelsExist, runPredictJson } from './predictJson';
import { summarizeQueue } from './summarizeQueue';

type QueueSnapshot = {
    generatedAt: string;
    pendingCount: number;
    scoredCount: number;
    hasMoreNewer: boolean;
    hasMoreOlder: boolean;
    items: CategorizationQueueItemDto[];
};

type WindowQuery = {
    around?: string;
    olderThan?: string;
    newerThan?: string;
};

let queueLoadChain: Promise<unknown> = Promise.resolve();

/**
 * Returns the review queue: disk-cached proposals joined to current pending transactions.
 * Spawns predict-json only for a batch of uncached or stale ids.
 */
export async function loadCategorizationQueue(query: CategorizationQueueQuery): Promise<CategorizationQueueDto> {
    const refresh = query.refresh === true;
    const expand = query.expand === true && !refresh;
    const windowQuery = refresh ? undefined : readWindowQuery(query);
    const snapshot = await getQueueSnapshot(refresh, expand, windowQuery);
    const filteredItems = filterAndSortQueueItems(snapshot.items, {
        tiers: parseTierFilter(query.tier),
        accountId: query.accountId,
    });

    return {
        summary: summarizeQueue(snapshot.items.map((item) => item.proposal)),
        generatedAt: snapshot.generatedAt,
        llm: false,
        pendingCount: snapshot.pendingCount,
        scoredCount: snapshot.scoredCount,
        hasMore: windowQuery ? snapshot.hasMoreOlder : snapshot.pendingCount > snapshot.scoredCount,
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

async function getQueueSnapshot(
    refresh: boolean,
    expand: boolean,
    windowQuery: WindowQuery | undefined,
): Promise<QueueSnapshot> {
    const run = (): Promise<QueueSnapshot> => loadQueueSnapshot(refresh, expand, windowQuery);
    const result = queueLoadChain.then(run, run);
    queueLoadChain = result.then(
        () => undefined,
        () => undefined,
    );
    return result;
}

async function loadQueueSnapshot(
    refresh: boolean,
    expand: boolean,
    windowQuery: WindowQuery | undefined,
): Promise<QueueSnapshot> {
    assertCategorizationModelsExist(CATEGORIZATION_MODELS_DIR);

    const pending = await listPendingTransactions();
    const pendingIds = pending.map((row) => row.id);
    const signature = modelSignature(CATEGORIZATION_MODELS_DIR);
    const travelSignature = await loadTravelWindowsSignature();
    const path = cacheFilePath(CATEGORIZATION_QUEUE_CACHE_DIR, false);
    const cache = await readProposalCache(path);
    const fingerprints = new Map(pending.map((row) => [row.id, row.fingerprint]));
    const cacheEntries = cacheEntriesMap(cache);
    const cacheUsable = isCacheUsable(cache, false, signature, travelSignature);

    const windowScoring = windowQuery
        ? selectWindowScoring({
              pendingIds,
              fingerprints,
              cacheEntries,
              cacheUsable,
              batchSize: CATEGORIZATION_QUEUE_BATCH_SIZE,
              around: windowQuery.around,
              olderThan: windowQuery.olderThan,
              newerThan: windowQuery.newerThan,
          })
        : undefined;

    const batch = windowScoring
        ? { kept: windowScoring.kept, idsToScore: windowScoring.idsToScore }
        : selectScoringBatch({
              pendingIds,
              fingerprints,
              cacheEntries,
              cacheUsable,
              batchSize: CATEGORIZATION_QUEUE_BATCH_SIZE,
              refresh,
              expand,
          });

    let kept = batch.kept;
    let generatedAt = latestGeneratedAt(kept) ?? new Date().toISOString();

    if (batch.idsToScore.length > 0) {
        const envelope = await runPredictJson({
            workingDir: CATEGORIZATION_AI_WORKING_DIR,
            modelsDir: CATEGORIZATION_MODELS_DIR,
            connectionString: getDbConnectionString(),
            sqliteDbPath: getSqliteDbPath(),
            timeoutMs: CATEGORIZATION_PREDICT_TIMEOUT_MS,
            llm: false,
            transactionIds: batch.idsToScore,
        });
        const scoredAt = new Date().toISOString();
        generatedAt = scoredAt;
        const scoredEntries: CachedProposalEntry[] = [];
        for (const proposal of envelope.proposals) {
            const fingerprint = fingerprints.get(proposal.transactionId);
            if (!fingerprint) {
                continue;
            }
            scoredEntries.push({ fingerprint, generatedAt: scoredAt, proposal });
        }
        kept = [...kept, ...scoredEntries];
    }

    if (shouldRewriteCache(cache, kept, signature, travelSignature)) {
        await writeProposalCache({
            path,
            llm: false,
            modelSignature: signature,
            travelWindowsSignature: travelSignature,
            entries: kept,
        });
    }

    const proposalsById = new Map(kept.map((entry) => [entry.proposal.transactionId, entry.proposal]));
    const sliceIds = windowScoring ? new Set(windowScoring.ids) : undefined;
    const scoredItems: Array<Omit<CategorizationQueueItemDto, 'relatedTransactions'>> = [];
    for (const row of pending) {
        if (sliceIds && !sliceIds.has(row.id)) {
            continue;
        }
        const proposal = proposalsById.get(row.id);
        if (!proposal) {
            continue;
        }
        scoredItems.push({ transaction: toTransactionDetail(row), proposal });
    }
    const items = await hydrateRelatedTransactions(scoredItems);
    const hasMoreNewer = windowScoring ? windowScoring.startIndex > 0 : false;
    const hasMoreOlder = windowScoring
        ? windowScoring.endIndexExclusive < pending.length
        : pending.length > items.length;

    return {
        generatedAt,
        pendingCount: pending.length,
        scoredCount: windowScoring ? kept.length : items.length,
        hasMoreNewer,
        hasMoreOlder,
        items,
    };
}

function latestGeneratedAt(entries: readonly CachedProposalEntry[]): string | undefined {
    let latest: string | undefined;
    for (const entry of entries) {
        if (!latest || entry.generatedAt > latest) {
            latest = entry.generatedAt;
        }
    }
    return latest;
}

function shouldRewriteCache(
    cache: ProposalCacheFile | undefined,
    kept: readonly CachedProposalEntry[],
    signature: string,
    travelSignature: string,
): boolean {
    if (!isCacheUsable(cache, false, signature, travelSignature)) {
        return true;
    }

    if (Object.keys(cache.entries).length !== kept.length) {
        return true;
    }

    for (const entry of kept) {
        const existing = cache.entries[entry.proposal.transactionId];
        if (!existing || existing.generatedAt !== entry.generatedAt || existing.fingerprint !== entry.fingerprint) {
            return true;
        }
    }

    return false;
}
