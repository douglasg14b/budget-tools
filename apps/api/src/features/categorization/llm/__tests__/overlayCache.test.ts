import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { LlmSuggestOverlayDto } from '../../categorizationDtos';
import { clearLlmOverlayCache, overlayCachePath, readLlmOverlay, writeLlmOverlay } from '../overlayCache';

describe('overlayCache', () => {
    let cacheDir: string;

    beforeEach(async () => {
        cacheDir = await mkdtemp(join(tmpdir(), 'llm-overlay-cache-'));
    });

    afterEach(async () => {
        await clearLlmOverlayCache(cacheDir);
        await rm(cacheDir, { recursive: true, force: true });
    });

    it('returns a written overlay for a matching fingerprint', async () => {
        const overlay = sampleOverlay('tx-1');
        await writeLlmOverlay(cacheDir, 'fp-1', overlay);

        await expect(readLlmOverlay(cacheDir, 'tx-1', 'fp-1')).resolves.toEqual(overlay);
    });

    it('drops memory and disk entries on clear', async () => {
        await writeLlmOverlay(cacheDir, 'fp-1', sampleOverlay('tx-1'));
        await expect(access(overlayCachePath(cacheDir))).resolves.toBeUndefined();

        await clearLlmOverlayCache(cacheDir);

        await expect(readLlmOverlay(cacheDir, 'tx-1', 'fp-1')).resolves.toBeUndefined();
        await expect(access(overlayCachePath(cacheDir))).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('clear is a no-op when the file is missing', async () => {
        await expect(clearLlmOverlayCache(cacheDir)).resolves.toBeUndefined();
    });
});

function sampleOverlay(transactionId: string): LlmSuggestOverlayDto {
    return {
        transactionId,
        model: 'test-model',
        suggestedCategory: 'Groceries',
        suggestedCategoryGroup: 'Needs',
        suggestedCategoryId: 'cat-1',
        confidence: 0.5,
        notes: null,
        payeeSuggestion: null,
        options: [],
    };
}
