import type { CachedProposalEntry } from './types';

export type SelectWindowSliceInput = {
    readonly pendingIds: readonly string[];
    readonly batchSize: number;
    readonly around?: string;
    readonly olderThan?: string;
    readonly newerThan?: string;
};

export type SelectWindowSliceResult = {
    readonly ids: string[];
    readonly startIndex: number;
    readonly endIndexExclusive: number;
};

export type SelectWindowScoringInput = SelectWindowSliceInput & {
    readonly fingerprints: ReadonlyMap<string, string>;
    readonly cacheEntries: ReadonlyMap<string, CachedProposalEntry>;
    readonly cacheUsable: boolean;
};

export type SelectWindowScoringResult = SelectWindowSliceResult & {
    readonly kept: CachedProposalEntry[];
    readonly idsToScore: string[];
};

/**
 * Contiguous pending-id window in newest-first order.
 *
 * `around` centers `batchSize` on that id (unknown id → newest window).
 * `olderThan` / `newerThan` take the next exclusive batch on that side.
 */
export function selectWindowSlice(input: SelectWindowSliceInput): SelectWindowSliceResult {
    const pendingIds = input.pendingIds;
    const batchSize = input.batchSize;
    const count = pendingIds.length;
    if (count === 0 || batchSize <= 0) {
        return { ids: [], startIndex: 0, endIndexExclusive: 0 };
    }

    if (input.olderThan) {
        const cursorIndex = pendingIds.indexOf(input.olderThan);
        const startIndex = cursorIndex === -1 ? 0 : cursorIndex + 1;
        const endIndexExclusive = Math.min(count, startIndex + batchSize);
        return {
            ids: pendingIds.slice(startIndex, endIndexExclusive),
            startIndex,
            endIndexExclusive,
        };
    }

    if (input.newerThan) {
        const cursorIndex = pendingIds.indexOf(input.newerThan);
        const endIndexExclusive = cursorIndex === -1 ? 0 : cursorIndex;
        const startIndex = Math.max(0, endIndexExclusive - batchSize);
        return {
            ids: pendingIds.slice(startIndex, endIndexExclusive),
            startIndex,
            endIndexExclusive,
        };
    }

    let aroundIndex = input.around ? pendingIds.indexOf(input.around) : 0;
    if (aroundIndex === -1) {
        aroundIndex = 0;
    }

    const back = Math.floor((batchSize - 1) / 2);
    let startIndex = aroundIndex - back;
    let endIndexExclusive = startIndex + batchSize;
    if (startIndex < 0) {
        startIndex = 0;
        endIndexExclusive = Math.min(count, batchSize);
    } else if (endIndexExclusive > count) {
        endIndexExclusive = count;
        startIndex = Math.max(0, endIndexExclusive - batchSize);
    }

    return {
        ids: pendingIds.slice(startIndex, endIndexExclusive),
        startIndex,
        endIndexExclusive,
    };
}

/**
 * Keeps every still-valid pending cache entry and scores only unscored ids in the window.
 * A middle window must not drop newest cached rows from `kept`.
 */
export function selectWindowScoring(input: SelectWindowScoringInput): SelectWindowScoringResult {
    const slice = selectWindowSlice(input);
    const kept = collectValidCacheEntries(input);
    const keptIds = new Set(kept.map((entry) => entry.proposal.transactionId));
    const idsToScore = slice.ids.filter((transactionId) => !keptIds.has(transactionId));
    return { ...slice, kept, idsToScore };
}

/**
 * Cache entries that still match a pending transaction fingerprint.
 */
export function collectValidCacheEntries(input: {
    readonly pendingIds: readonly string[];
    readonly fingerprints: ReadonlyMap<string, string>;
    readonly cacheEntries: ReadonlyMap<string, CachedProposalEntry>;
    readonly cacheUsable: boolean;
}): CachedProposalEntry[] {
    const kept: CachedProposalEntry[] = [];
    if (!input.cacheUsable) {
        return kept;
    }

    for (const transactionId of input.pendingIds) {
        const entry = input.cacheEntries.get(transactionId);
        if (!entry) {
            continue;
        }
        const fingerprint = input.fingerprints.get(transactionId);
        if (fingerprint && entry.fingerprint === fingerprint) {
            kept.push(entry);
        }
    }

    return kept;
}
