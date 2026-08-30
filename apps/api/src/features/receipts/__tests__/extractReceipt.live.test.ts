import { afterAll, describe, expect, it } from 'vitest';

import { getOpenRouterApiKey } from '../../../environment';
import { extractReceipt } from '../extractReceipt';
import { discardOcrWorker } from '../pipeline/ocrReceiptLines';
import { renderAmazonReceiptPng, renderCafeReceiptPng } from './renderReceiptFixture';

const LIVE_TIMEOUT_MS = 180_000;
const hasOpenRouterKey = Boolean(getOpenRouterApiKey());

describe.skipIf(!hasOpenRouterKey)('extractReceipt live OpenRouter + OCR', () => {
    afterAll(async () => {
        await discardOcrWorker();
    });

    it(
        'extracts cafe match keys from a rendered receipt image',
        async () => {
            const png = await renderCafeReceiptPng();
            const result = await extractReceipt({ frames: [png] });
            if (result.kind !== 'complete') {
                throw new Error(`expected complete cafe extract, got ${JSON.stringify(result)}`);
            }
            const extractJson = JSON.parse(result.extractJson) as {
                repaired: boolean;
                gated: boolean;
                error: string | null;
            };
            console.info('fixture A extract', {
                kind: result.kind,
                extractStatus: result.extractStatus,
                vendor: result.vendor,
                purchaseDate: result.purchaseDate,
                printedMilliunits: result.printedMilliunits,
                totalsDisagree: result.totalsDisagree,
                repaired: extractJson.repaired,
                gated: extractJson.gated,
                error: extractJson.error,
            });
            expect(result.extractStatus).not.toBe('failed');
            expect(['gated', 'ungated']).toContain(result.extractStatus);
            expect(result.vendor).toMatch(/hearth/i);
            expect(result.vendor).toMatch(/rye/i);
            expect(result.purchaseDate).toBe('2026-08-01');
            expect(result.printedMilliunits).toBe(8120);
        },
        LIVE_TIMEOUT_MS,
    );

    it(
        'drops an Amazon paper receipt before it becomes a receipt row',
        async () => {
            const png = await renderAmazonReceiptPng();
            const result = await extractReceipt({ frames: [png] });
            console.info('fixture B extract', result);
            expect(result).toEqual({ kind: 'amazon' });
        },
        LIVE_TIMEOUT_MS,
    );
});
