import { describe, expect, it, vi } from 'vitest';

import { buildFailedReceiptExtract, extractReceipt } from '../extractReceipt';
import { jpegDataUrl } from '../pipeline/prepReceiptImage';
import type { CompleteOpenRouterJson } from '../pipeline/receiptHeaderVision';

const processed = Buffer.from('processed-jpeg');

function headerContent(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
        vendor: 'Cafe Rio',
        purchaseDate: '2026-08-01',
        printedTotalDollars: 8.12,
        ...overrides,
    });
}

function linesContent(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
        vendor: 'Cafe Rio',
        purchaseDate: '2026-08-01',
        printedTotalDollars: 8.12,
        taxDollars: 0.62,
        discountDollars: 0.2,
        lines: [
            { name: 'Latte', amountDollars: 4.5, quantity: 1 },
            { name: 'Muffin', amountDollars: 3.2, quantity: 1 },
        ],
        ...overrides,
    });
}

function completeJsonReturning(contentFor: Record<string, string>): CompleteOpenRouterJson {
    return async (input) => {
        const content = contentFor[input.schemaName];
        if (!content) {
            throw new Error(`unexpected schema ${input.schemaName}`);
        }
        return {
            content,
            usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110, cachedTokens: null, costUsd: 0.001 },
        };
    };
}

describe('extractReceipt', () => {
    it('sends processed jpeg data URLs to vision, not the original bytes', async () => {
        const original = Buffer.from('original-bytes');
        const completeJson = vi.fn(
            completeJsonReturning({
                receipt_headers: headerContent(),
                receipt_lines: linesContent(),
            }),
        );
        const result = await extractReceipt({
            frames: [original],
            apiKey: 'test-key',
            completeJson,
            prep: async (frames) => {
                expect(frames[0]?.equals(original)).toBe(true);
                return processed;
            },
        });
        expect(result.kind).toBe('complete');
        expect(completeJson).toHaveBeenCalledTimes(2);
        expect(completeJson.mock.calls.map((call) => call[0].schemaName)).toEqual(['receipt_headers', 'receipt_lines']);
        expect(completeJson.mock.calls[0]?.[0].images).toEqual([jpegDataUrl(processed)]);
        expect(completeJson.mock.calls[1]?.[0].images).toEqual([jpegDataUrl(processed)]);
        expect(completeJson.mock.calls[1]?.[0].user).toContain('8.12');
        expect(completeJson.mock.calls[1]?.[0].user).not.toContain('OCR dump');
    });

    it('can use one stronger vision model for both explicit retry passes', async () => {
        const completeJson = vi.fn(
            completeJsonReturning({
                receipt_headers: headerContent(),
                receipt_lines: linesContent(),
            }),
        );

        await extractReceipt({
            frames: [processed],
            apiKey: 'test-key',
            prep: async () => processed,
            completeJson,
            headerModel: 'test/frontier-vision',
            repairModel: 'test/frontier-vision',
        });

        expect(completeJson.mock.calls.map((call) => call[0].model)).toEqual([
            'test/frontier-vision',
            'test/frontier-vision',
        ]);
    });

    it('reads only header keys for a focused payee retry', async () => {
        const completeJson = vi.fn(completeJsonReturning({ receipt_headers: headerContent({ vendor: 'TJ Maxx' }) }));
        const result = await extractReceipt({
            frames: [processed],
            apiKey: 'test-key',
            prep: async () => processed,
            completeJson,
            headerOnly: true,
            headerModel: 'test/frontier-vision',
        });

        expect(result).toMatchObject({ kind: 'complete', vendor: 'TJ Maxx', extractStatus: 'ungated' });
        expect(completeJson.mock.calls.map((call) => call[0].schemaName)).toEqual(['receipt_headers']);
        expect(completeJson.mock.calls[0]?.[0].model).toBe('test/frontier-vision');
    });

    it('returns amazon when the header vendor is Amazon and skips line vision', async () => {
        const completeJson = vi.fn(completeJsonReturning({ receipt_headers: headerContent({ vendor: 'AMAZON.COM' }) }));
        const result = await extractReceipt({
            frames: [processed],
            apiKey: 'test-key',
            prep: async () => processed,
            completeJson,
        });
        expect(result).toEqual({ kind: 'amazon' });
        expect(completeJson).toHaveBeenCalledTimes(1);
        expect(completeJson.mock.calls[0]?.[0].schemaName).toBe('receipt_headers');
    });

    it('stores gated when line vision plus tax minus discounts equal printed', async () => {
        const result = await extractReceipt({
            frames: [processed],
            apiKey: 'test-key',
            prep: async () => processed,
            completeJson: completeJsonReturning({
                receipt_headers: headerContent(),
                receipt_lines: linesContent(),
            }),
        });
        expect(result.kind).toBe('complete');
        if (result.kind !== 'complete') {
            return;
        }
        expect(result.extractStatus).toBe('gated');
        expect(result.totalsDisagree).toBe(false);
        expect(result.vendor).toBe('Cafe Rio');
        expect(result.purchaseDate).toBe('2026-08-01');
        expect(result.printedMilliunits).toBe(8120);
        expect(result.rawText).toContain('Latte 4.50');
        expect(JSON.parse(result.extractJson)).toMatchObject({ repaired: true, gated: true });
        expect(result.extractCostUsd).toBeCloseTo(0.002);
        expect(result.extractPromptTokens).toBe(200);
        expect(result.extractCompletionTokens).toBe(20);
    });

    it('stores ungated when line arithmetic still disagrees', async () => {
        const result = await extractReceipt({
            frames: [processed],
            apiKey: 'test-key',
            prep: async () => processed,
            completeJson: completeJsonReturning({
                receipt_headers: headerContent(),
                receipt_lines: linesContent({
                    lines: [{ name: 'Latte', amountDollars: 1, quantity: 1 }],
                    taxDollars: 0,
                    discountDollars: 0,
                }),
            }),
        });
        expect(result.kind).toBe('complete');
        if (result.kind !== 'complete') {
            return;
        }
        expect(result.extractStatus).toBe('ungated');
        expect(JSON.parse(result.extractJson)).toMatchObject({ repaired: true, gated: false });
    });

    it('sets totalsDisagree when header and line-vision totals differ', async () => {
        const result = await extractReceipt({
            frames: [processed],
            apiKey: 'test-key',
            prep: async () => processed,
            completeJson: completeJsonReturning({
                receipt_headers: headerContent(),
                receipt_lines: linesContent({ printedTotalDollars: 9 }),
            }),
        });
        expect(result.kind).toBe('complete');
        if (result.kind !== 'complete') {
            return;
        }
        expect(result.totalsDisagree).toBe(true);
        expect(result.extractStatus).toBe('ungated');
    });

    it('stores failed when match keys are missing rather than inventing them', async () => {
        const result = await extractReceipt({
            frames: [processed],
            apiKey: 'test-key',
            prep: async () => processed,
            completeJson: completeJsonReturning({
                receipt_headers: headerContent({
                    vendor: null,
                    purchaseDate: null,
                    printedTotalDollars: null,
                }),
                receipt_lines: linesContent({
                    vendor: null,
                    purchaseDate: null,
                    printedTotalDollars: null,
                    lines: [],
                    taxDollars: 0,
                    discountDollars: 0,
                }),
            }),
        });
        expect(result.kind).toBe('complete');
        if (result.kind !== 'complete') {
            return;
        }
        expect(result.extractStatus).toBe('failed');
        expect(result.vendor).toBeNull();
        expect(result.purchaseDate).toBeNull();
        expect(result.printedMilliunits).toBeNull();
        expect(result.rawText).toBeNull();
    });

    it('returns amazon when header vendor is null and line vision looks like Amazon', async () => {
        const result = await extractReceipt({
            frames: [processed],
            apiKey: 'test-key',
            prep: async () => processed,
            completeJson: completeJsonReturning({
                receipt_headers: headerContent({ vendor: null }),
                receipt_lines: linesContent({ vendor: 'AMAZON.COM' }),
            }),
        });
        expect(result).toEqual({ kind: 'amazon' });
    });

    it('warns without inventing keys when header vision throws', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const result = await extractReceipt({
            frames: [processed],
            apiKey: 'test-key',
            prep: async () => processed,
            completeJson: async () => {
                throw new Error('vision down');
            },
        });
        expect(warn).toHaveBeenCalled();
        expect(result.kind).toBe('complete');
        if (result.kind === 'complete') {
            expect(result.extractStatus).toBe('failed');
            expect(result.vendor).toBeNull();
            expect(result.purchaseDate).toBeNull();
            expect(result.extractCostUsd).toBeNull();
            expect(JSON.parse(result.extractJson)).toMatchObject({ error: 'vision down' });
        }
        warn.mockRestore();
    });
});

describe('buildFailedReceiptExtract', () => {
    it('returns a failed payload with the error and no match keys', () => {
        const result = buildFailedReceiptExtract('prep exploded');
        expect(result).toMatchObject({
            kind: 'complete',
            extractStatus: 'failed',
            vendor: null,
            purchaseDate: null,
            printedMilliunits: null,
            totalsDisagree: false,
            rawText: null,
        });
        expect(JSON.parse(result.extractJson)).toMatchObject({
            repaired: false,
            gated: false,
            error: 'prep exploded',
            lines: [],
        });
    });
});
