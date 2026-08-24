import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { LlmSuggestOverlayDto } from '../categorizationDtos';

const OVERLAY_CACHE_VERSION = 4;

type OverlayCacheFile = {
    readonly version: number;
    readonly overlays: Record<string, CachedOverlay>;
};

type CachedOverlay = {
    readonly fingerprint: string;
    readonly overlay: LlmSuggestOverlayDto;
};

const memory = new Map<string, CachedOverlay>();

export function overlayCachePath(cacheDir: string): string {
    return join(cacheDir, 'llm-overlays.json');
}

export async function readLlmOverlay(
    cacheDir: string,
    transactionId: string,
    fingerprint: string,
): Promise<LlmSuggestOverlayDto | undefined> {
    const memoryHit = memory.get(transactionId);
    if (memoryHit?.fingerprint === fingerprint) {
        return memoryHit.overlay;
    }

    const file = await readOverlayFile(overlayCachePath(cacheDir));
    const cached = file?.overlays[transactionId];
    if (!cached || cached.fingerprint !== fingerprint) {
        return undefined;
    }
    memory.set(transactionId, cached);
    return cached.overlay;
}

/**
 * Deletes on-disk overlays and the in-process map. Called at API start so
 * prompt/scoring changes are not served from a previous process.
 */
export async function clearLlmOverlayCache(cacheDir: string): Promise<void> {
    memory.clear();
    try {
        await unlink(overlayCachePath(cacheDir));
    } catch (error) {
        if (!isEnoent(error)) {
            throw error;
        }
    }
}

export async function writeLlmOverlay(
    cacheDir: string,
    fingerprint: string,
    overlay: LlmSuggestOverlayDto,
): Promise<void> {
    const cached = { fingerprint, overlay };
    memory.set(overlay.transactionId, cached);

    const path = overlayCachePath(cacheDir);
    const file = (await readOverlayFile(path)) ?? { version: OVERLAY_CACHE_VERSION, overlays: {} };
    const next: OverlayCacheFile = {
        version: OVERLAY_CACHE_VERSION,
        overlays: { ...file.overlays, [overlay.transactionId]: cached },
    };

    await mkdir(dirname(path), { recursive: true });
    const tempPath = `${path}.${process.pid}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    await rename(tempPath, path);
}

async function readOverlayFile(path: string): Promise<OverlayCacheFile | undefined> {
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
        if (!isOverlayCacheFile(parsed)) {
            return undefined;
        }
        return parsed;
    } catch {
        return undefined;
    }
}

function isOverlayCacheFile(value: unknown): value is OverlayCacheFile {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const record = value as Record<string, unknown>;
    return record.version === OVERLAY_CACHE_VERSION && typeof record.overlays === 'object' && record.overlays !== null;
}

function isEnoent(error: unknown): boolean {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}
