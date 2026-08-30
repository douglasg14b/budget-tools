import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { getOpenRouterApiKey } from '../../../environment';
import { extractReceipt } from '../extractReceipt';
import { renderAmazonReceiptPng, renderCafeReceiptPng } from './renderReceiptFixture';

const LIVE_TIMEOUT_MS = 90_000;
const hasOpenRouterKey = Boolean(getOpenRouterApiKey());
const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

type PhotographedReceiptCase = {
    readonly file: string;
    readonly label: string;
    readonly vendor: RegExp;
    readonly purchaseDate: string;
    readonly printedMilliunits: number;
};

/** Wikimedia Commons photographs/scans — attribution in fixtures/sources.json. */
const PHOTOGRAPHED_RECEIPTS: readonly PhotographedReceiptCase[] = [
    {
        file: 'walmart.jpg',
        label: 'Walmart grocery',
        vendor: /walmart/i,
        purchaseDate: '2021-07-25',
        printedMilliunits: 191_130,
    },
    {
        file: 'save-mart.jpg',
        label: 'Save Mart supermarket',
        vendor: /save\s*mart/i,
        purchaseDate: '2010-10-23',
        printedMilliunits: 3_990,
    },
    {
        file: 'cameron-market.jpg',
        label: 'Cameron Market grocery',
        vendor: /cameron/i,
        purchaseDate: '2021-07-21',
        printedMilliunits: 87_790,
    },
    {
        file: 'tesco.jpg',
        label: 'Tesco grocery',
        vendor: /tesco/i,
        purchaseDate: '1994-04-19',
        printedMilliunits: 6_710,
    },
    {
        file: 'biedronka.jpg',
        label: 'Biedronka supermarket',
        vendor: /biedronka/i,
        purchaseDate: '2020-01-09',
        printedMilliunits: 8_270,
    },
];

describe.skipIf(!hasOpenRouterKey)('extractReceipt live OpenRouter', () => {
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

    it.each(PHOTOGRAPHED_RECEIPTS)(
        'extracts match keys from a photographed $label receipt',
        async ({ file, vendor, purchaseDate, printedMilliunits }) => {
            const bytes = await readFile(join(fixturesDir, file));
            const result = await extractReceipt({ frames: [bytes] });
            if (result.kind !== 'complete') {
                throw new Error(`expected complete extract for ${file}, got ${JSON.stringify(result)}`);
            }
            const extractJson = JSON.parse(result.extractJson) as {
                repaired: boolean;
                gated: boolean;
                error: string | null;
            };
            console.info(`${file} extract`, {
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
            expect(result.vendor).toMatch(vendor);
            expect(result.purchaseDate).toBe(purchaseDate);
            expect(result.printedMilliunits).toBe(printedMilliunits);
        },
        LIVE_TIMEOUT_MS,
    );
});
