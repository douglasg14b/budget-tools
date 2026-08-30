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

function repairContent(overrides: Record<string, unknown> = {}): string {
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
        return content;
    };
}

const gatedOcr = {
    rawText: 'Latte 4.50\nMuffin 3.20\nTax 0.62\nDiscount 0.20\nTotal 8.12',
    lines: [
        { name: 'Latte', amountMilliunits: 4500, quantity: null },
        { name: 'Muffin', amountMilliunits: 3200, quantity: null },
    ],
    taxMilliunits: 620,
    discountMilliunits: 200,
    printedMilliunits: 8120,
};

describe('extractReceipt', () => {
    it('sends processed jpeg data URLs to vision, not the original bytes', async () => {
        const original = Buffer.from('original-bytes');
        const completeJson = vi.fn(completeJsonReturning({ receipt_headers: headerContent() }));
        const result = await extractReceipt({
            frames: [original],
            apiKey: 'test-key',
            completeJson,
            prep: async (frames) => {
                expect(frames[0]?.equals(original)).toBe(true);
                return processed;
            },
            ocr: async () => gatedOcr,
        });
        expect(result.kind).toBe('complete');
        expect(completeJson).toHaveBeenCalledTimes(1);
        const input = completeJson.mock.calls[0]?.[0];
        expect(input?.images).toEqual([jpegDataUrl(processed)]);
    });

    it('returns amazon when the header vendor is Amazon and skips OCR', async () => {
        let ocrCalls = 0;
        const result = await extractReceipt({
            frames: [processed],
            apiKey: 'test-key',
            prep: async () => processed,
            completeJson: completeJsonReturning({ receipt_headers: headerContent({ vendor: 'AMAZON.COM' }) }),
            ocr: async () => {
                ocrCalls += 1;
                return gatedOcr;
            },
        });
        expect(result).toEqual({ kind: 'amazon' });
        expect(ocrCalls).toBe(0);
    });

    it('stores gated when lines plus tax minus discounts equal printed and totals agree', async () => {
        const result = await extractReceipt({
            frames: [processed],
            apiKey: 'test-key',
            prep: async () => processed,
            completeJson: completeJsonReturning({ receipt_headers: headerContent() }),
            ocr: async () => gatedOcr,
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
        expect(JSON.parse(result.extractJson)).toMatchObject({ repaired: false, gated: true });
    });

    it('repairs once when the arithmetic gate fails, then stores gated', async () => {
        const completeJson = vi.fn(
            completeJsonReturning({
                receipt_headers: headerContent(),
                receipt_repair: repairContent(),
            }),
        );
        const result = await extractReceipt({
            frames: [processed],
            apiKey: 'test-key',
            prep: async () => processed,
            completeJson,
            ocr: async () => ({
                ...gatedOcr,
                lines: [{ name: 'Latte', amountMilliunits: 1000, quantity: null }],
            }),
        });
        expect(completeJson.mock.calls.map((call) => call[0].schemaName)).toEqual([
            'receipt_headers',
            'receipt_repair',
        ]);
        expect(result.kind).toBe('complete');
        if (result.kind !== 'complete') {
            return;
        }
        expect(result.extractStatus).toBe('gated');
        expect(JSON.parse(result.extractJson)).toMatchObject({ repaired: true, gated: true });
    });

    it('stores ungated after repair when arithmetic still disagrees', async () => {
        const result = await extractReceipt({
            frames: [processed],
            apiKey: 'test-key',
            prep: async () => processed,
            completeJson: completeJsonReturning({
                receipt_headers: headerContent(),
                receipt_repair: repairContent({
                    lines: [{ name: 'Latte', amountDollars: 1, quantity: 1 }],
                    taxDollars: 0,
                    discountDollars: 0,
                }),
            }),
            ocr: async () => ({
                ...gatedOcr,
                lines: [{ name: 'Latte', amountMilliunits: 1000, quantity: null }],
            }),
        });
        expect(result.kind).toBe('complete');
        if (result.kind !== 'complete') {
            return;
        }
        expect(result.extractStatus).toBe('ungated');
        expect(JSON.parse(result.extractJson)).toMatchObject({ repaired: true, gated: false });
    });

    it('sets totalsDisagree and does not gate when header and OCR totals differ', async () => {
        const completeJson = vi.fn(
            completeJsonReturning({
                receipt_headers: headerContent(),
                receipt_repair: repairContent(),
            }),
        );
        const result = await extractReceipt({
            frames: [processed],
            apiKey: 'test-key',
            prep: async () => processed,
            completeJson,
            ocr: async () => ({ ...gatedOcr, printedMilliunits: 9000 }),
        });
        expect(completeJson).toHaveBeenCalledTimes(2);
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
            }),
            ocr: async () => ({
                rawText: 'unreadable',
                lines: [],
                taxMilliunits: 0,
                discountMilliunits: 0,
                printedMilliunits: null,
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
        expect(result.rawText).toBe('unreadable');
    });

    it('returns amazon when header vendor is null and OCR text looks like Amazon', async () => {
        const result = await extractReceipt({
            frames: [processed],
            apiKey: 'test-key',
            prep: async () => processed,
            completeJson: completeJsonReturning({
                receipt_headers: headerContent({ vendor: null }),
            }),
            ocr: async () => ({
                rawText: 'AMAZON.COM\nAMZN Mktp\nUSB Cable 12.99\nTotal 14.16',
                lines: [{ name: 'USB Cable', amountMilliunits: 12990, quantity: null }],
                taxMilliunits: 1170,
                discountMilliunits: 0,
                printedMilliunits: 14160,
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
            ocr: async () => gatedOcr,
        });
        expect(warn).toHaveBeenCalled();
        expect(result.kind).toBe('complete');
        if (result.kind === 'complete') {
            expect(result.extractStatus).toBe('failed');
            expect(result.vendor).toBeNull();
            expect(result.purchaseDate).toBeNull();
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
