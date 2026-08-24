import { statSync } from 'node:fs';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { CachedProposalEntry, ProposalCacheFile } from './types';
import { PROPOSAL_CACHE_VERSION } from './types';

const MODEL_FILES = ['category-model.zip', 'group-model.zip', 'payee-model.zip'] as const;

/**
 * Identity of the on-disk ML models. Any change invalidates every cached proposal.
 */
export function modelSignature(modelsDir: string): string {
    return MODEL_FILES.map((fileName) => {
        const stats = statSync(join(modelsDir, fileName));
        return `${fileName}:${stats.size}:${stats.mtimeMs}`;
    }).join('|');
}

export function isCacheUsable(
    cache: ProposalCacheFile | undefined,
    llm: boolean,
    signature: string,
    travelWindowsSignature: string,
): cache is ProposalCacheFile {
    return (
        cache !== undefined &&
        cache.version === PROPOSAL_CACHE_VERSION &&
        cache.llm === llm &&
        cache.modelSignature === signature &&
        cache.travelWindowsSignature === travelWindowsSignature
    );
}

export function cacheFilePath(cacheDir: string, llm: boolean): string {
    return join(cacheDir, llm ? 'llm-true.json' : 'llm-false.json');
}

/**
 * Reads the proposal cache file. A missing or unreadable file is an empty cache.
 */
export async function readProposalCache(path: string): Promise<ProposalCacheFile | undefined> {
    let text: string;
    try {
        text = await readFile(path, 'utf8');
    } catch (error) {
        if (isEnoent(error)) {
            return undefined;
        }
        throw error;
    }

    try {
        const parsed: unknown = JSON.parse(text);
        if (!isProposalCacheFile(parsed)) {
            console.warn(`Ignoring unusable proposal cache at ${path}`);
            return undefined;
        }
        return parsed;
    } catch {
        console.warn(`Ignoring invalid JSON proposal cache at ${path}`);
        return undefined;
    }
}

/**
 * Atomically replaces the proposal cache with the given entries (pending-only).
 */
export async function writeProposalCache(input: {
    readonly path: string;
    readonly llm: boolean;
    readonly modelSignature: string;
    readonly travelWindowsSignature: string;
    readonly entries: readonly CachedProposalEntry[];
}): Promise<void> {
    const directory = dirname(input.path);
    await mkdir(directory, { recursive: true });

    const file: ProposalCacheFile = {
        version: PROPOSAL_CACHE_VERSION,
        llm: input.llm,
        modelSignature: input.modelSignature,
        travelWindowsSignature: input.travelWindowsSignature,
        entries: Object.fromEntries(input.entries.map((entry) => [entry.proposal.transactionId, entry])),
    };

    const tempPath = `${input.path}.${process.pid}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
    try {
        await unlink(input.path);
    } catch (error) {
        if (!isEnoent(error)) {
            await unlink(tempPath).catch(() => undefined);
            throw error;
        }
    }

    try {
        await rename(tempPath, input.path);
    } catch (error) {
        await unlink(tempPath).catch(() => undefined);
        throw error;
    }
}

export function cacheEntriesMap(cache: ProposalCacheFile | undefined): Map<string, CachedProposalEntry> {
    if (!cache) {
        return new Map();
    }
    return new Map(Object.entries(cache.entries));
}

function isProposalCacheFile(value: unknown): value is ProposalCacheFile {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const record = value as Record<string, unknown>;
    if (record.version !== PROPOSAL_CACHE_VERSION) {
        return false;
    }
    if (typeof record.llm !== 'boolean' || typeof record.modelSignature !== 'string') {
        return false;
    }
    if (typeof record.travelWindowsSignature !== 'string') {
        return false;
    }
    if (!record.entries || typeof record.entries !== 'object' || Array.isArray(record.entries)) {
        return false;
    }
    return true;
}

function isEnoent(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
