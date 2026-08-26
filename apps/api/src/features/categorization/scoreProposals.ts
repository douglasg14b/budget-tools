import {
    CATEGORIZATION_AI_WORKING_DIR,
    CATEGORIZATION_MODELS_DIR,
    CATEGORIZATION_PREDICT_TIMEOUT_MS,
    getDbConnectionString,
    getSqliteDbPath,
} from '../../environment';
import { isCacheUsable, writeProposalCache } from './cache/proposalCache';
import type { CachedProposalEntry, ProposalCacheFile } from './cache/types';
import { runPredictJson } from './predictJson';

let scoreChain: Promise<unknown> = Promise.resolve();

/**
 * Serializes predict-json spawns so concurrent score requests share one CLI run at a time.
 */
export async function withScoreLock<T>(run: () => Promise<T>): Promise<T> {
    const result = scoreChain.then(run, run);
    scoreChain = result.then(
        () => undefined,
        () => undefined,
    );
    return result;
}

export type ScoreMissingInput = {
    readonly idsToScore: readonly string[];
    readonly fingerprints: ReadonlyMap<string, string>;
    readonly kept: CachedProposalEntry[];
    readonly cache: ProposalCacheFile | undefined;
    readonly signature: string;
    readonly travelSignature: string;
    readonly cachePath: string;
};

export type ScoreMissingResult = {
    readonly kept: CachedProposalEntry[];
    readonly generatedAt: string;
};

/**
 * Scores uncached ids via predict-json and rewrites the proposal cache.
 */
export async function scoreMissingIds(input: ScoreMissingInput): Promise<ScoreMissingResult> {
    let kept = input.kept;
    let generatedAt = latestGeneratedAt(kept) ?? new Date().toISOString();

    if (input.idsToScore.length > 0) {
        const envelope = await runPredictJson({
            workingDir: CATEGORIZATION_AI_WORKING_DIR,
            modelsDir: CATEGORIZATION_MODELS_DIR,
            connectionString: getDbConnectionString(),
            sqliteDbPath: getSqliteDbPath(),
            timeoutMs: CATEGORIZATION_PREDICT_TIMEOUT_MS,
            llm: false,
            transactionIds: input.idsToScore,
        });
        const scoredAt = new Date().toISOString();
        generatedAt = scoredAt;
        const scoredEntries: CachedProposalEntry[] = [];
        for (const proposal of envelope.proposals) {
            const fingerprint = input.fingerprints.get(proposal.transactionId);
            if (!fingerprint) {
                continue;
            }
            scoredEntries.push({ fingerprint, generatedAt: scoredAt, proposal });
        }
        kept = [...kept, ...scoredEntries];
    }

    if (shouldRewriteCache(input.cache, kept, input.signature, input.travelSignature)) {
        await writeProposalCache({
            path: input.cachePath,
            llm: false,
            modelSignature: input.signature,
            travelWindowsSignature: input.travelSignature,
            entries: kept,
        });
    }

    return { kept, generatedAt };
}

export function latestGeneratedAt(entries: readonly CachedProposalEntry[]): string | undefined {
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
