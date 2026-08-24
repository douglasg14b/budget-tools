import type { CachedProposalEntry } from './types';

export type SelectScoringBatchInput = {
    readonly pendingIds: readonly string[];
    readonly fingerprints: ReadonlyMap<string, string>;
    readonly cacheEntries: ReadonlyMap<string, CachedProposalEntry>;
    readonly cacheUsable: boolean;
    readonly batchSize: number;
    readonly refresh: boolean;
    /** Score the next never-scored batch even when the working set is already full. */
    readonly expand?: boolean;
};

export type SelectScoringBatchResult = {
    readonly kept: CachedProposalEntry[];
    readonly idsToScore: string[];
};

/**
 * Keeps cache entries that still match a pending transaction fingerprint.
 *
 * Stale rows (still pending, scoring inputs changed) are always rescored so they
 * do not vanish from the working set. When the valid set is below `batchSize`,
 * the next unscored pending ids are added — a full batch, because each CLI spawn
 * pays model-load warmup. `expand` scores another never-scored batch even when
 * the working set is already full (prefetch / infinite scroll).
 */
export function selectScoringBatch(input: SelectScoringBatchInput): SelectScoringBatchResult {
    if (input.refresh) {
        return {
            kept: [],
            idsToScore: input.pendingIds.slice(0, input.batchSize),
        };
    }

    const kept: CachedProposalEntry[] = [];
    const staleIds: string[] = [];
    if (input.cacheUsable) {
        for (const transactionId of input.pendingIds) {
            const entry = input.cacheEntries.get(transactionId);
            if (!entry) {
                continue;
            }
            const fingerprint = input.fingerprints.get(transactionId);
            if (fingerprint && entry.fingerprint === fingerprint) {
                kept.push(entry);
            } else {
                staleIds.push(transactionId);
            }
        }
    }

    const scoredIds = new Set([...kept.map((entry) => entry.proposal.transactionId), ...staleIds]);
    const neverScored = input.pendingIds.filter((transactionId) => !scoredIds.has(transactionId));
    const topUp = neverScored.slice(0, input.batchSize);

    if (input.expand) {
        return { kept, idsToScore: [...staleIds, ...topUp] };
    }

    if (kept.length + staleIds.length >= input.batchSize) {
        return { kept, idsToScore: staleIds };
    }

    return { kept, idsToScore: [...staleIds, ...topUp] };
}
