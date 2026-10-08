import { describe, expect, it, vi } from 'vitest';

import { buildFailedReceiptExtract, extractReceipt } from '../extractReceipt';
import { jpegDataUrl } from '../pipeline/prepReceiptImage';
import type { CompleteOpenRouterJson } from '../pipeline/receiptHeaderVision';

const processed = Buffer.from('processed-jpeg');

function headerContent(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
        vendor: 'Cafe Rio',
        purchaseDate: '2026-08-01',
        grandTotalDollars: 8.12,
        ...overrides,
    });
}

function linesContent(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
        vendor: 'Cafe Rio',
        purchaseDate: '2026-08-01',
        grandTotalDollars: 8.12,
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
            // The advisory verify pass calls OpenRouter directly; it has its own tests.
            verify: false,
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
            // The advisory verify pass calls OpenRouter directly; it has its own tests.
            verify: false,
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
            // The advisory verify pass calls OpenRouter directly; it has its own tests.
            verify: false,
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
            // The advisory verify pass calls OpenRouter directly; it has its own tests.
            verify: false,
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
            // The advisory verify pass calls OpenRouter directly; it has its own tests.
            verify: false,
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
            // The advisory verify pass calls OpenRouter directly; it has its own tests.
            verify: false,
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

    it('settles a signed card slip: verified tip, raised-cents total resolved by arithmetic, gated', async () => {
        const slip = completeJsonReturning({
            receipt_headers: headerContent({
                vendor: 'Riverside Hotel',
                grandTotalDollars: 17,
                hasHandwrittenAmounts: true,
            }),
            receipt_lines: linesContent({
                vendor: 'Riverside Hotel',
                grandTotalDollars: 17,
                taxDollars: null,
                discountDollars: null,
                tipDollars: 5,
                lines: [],
            }),
            receipt_totals_block: JSON.stringify({
                rows: [
                    { role: 'subtotal', label: 'Subtotal', writtenText: 'USD 12.66', medium: 'printed' },
                    { role: 'tip', label: 'Tip', writtenText: '5.00', medium: 'handwritten' },
                    { role: 'total', label: 'Total', writtenText: '17.66', medium: 'handwritten' },
                ],
            }),
            // Blind row reads: the tip is clear, the raised cents of the total are missed.
            receipt_row_read: JSON.stringify({ marksPresent: true, writtenText: '5.00' }),
        });
        const completeJson: CompleteOpenRouterJson = async (input) => {
            if (input.schemaName === 'receipt_row_read' && input.system.includes('grand total')) {
                return { content: JSON.stringify({ marksPresent: true, writtenText: '17' }), usage: null };
            }
            if (input.schemaName === 'receipt_total_choice') {
                const letter = /^([ABC])\) \$17\.66$/m.exec(input.user)?.[1] ?? 'D';
                return { content: JSON.stringify({ observation: 'raised 66', choice: letter }), usage: null };
            }
            return slip(input);
        };
        const result = await extractReceipt({
            frames: [processed],
            apiKey: 'test-key',
            // The advisory verify pass calls OpenRouter directly; it has its own tests.
            verify: false,
            prep: async () => processed,
            completeJson,
        });
        expect(result.kind).toBe('complete');
        if (result.kind !== 'complete') {
            return;
        }
        expect(result.extractStatus).toBe('gated');
        expect(result.printedMilliunits).toBe(17_660);
        expect(result.totalsDisagree).toBe(false);
        expect(result.rawText).toBe('Tip 5.00');
        expect(JSON.parse(result.extractJson)).toMatchObject({
            gated: true,
            tipMilliunits: 5000,
            handwrittenTotals: { totalSource: 'reconciled', consistent: true },
        });
    });

    it('stores no tip when the line read reports one but the handwritten-totals pass fails', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const result = await extractReceipt({
            frames: [processed],
            apiKey: 'test-key',
            // The advisory verify pass calls OpenRouter directly; it has its own tests.
            verify: false,
            prep: async () => processed,
            // No settle answers registered, so every settle call throws.
            completeJson: completeJsonReturning({
                receipt_headers: headerContent({ grandTotalDollars: 17 }),
                receipt_lines: linesContent({ grandTotalDollars: 17, tipDollars: 4.34 }),
            }),
        });
        warn.mockRestore();
        expect(result.kind).toBe('complete');
        if (result.kind !== 'complete') {
            return;
        }
        expect(result.printedMilliunits).toBe(17_000);
        const payload = JSON.parse(result.extractJson);
        expect(payload.tipMilliunits).toBe(0);
        expect(payload.error).toContain('handwritten totals');
    });

    it('counts the cost of settle reads that answered when another settle read fails', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const paid = completeJsonReturning({
            receipt_headers: headerContent({ grandTotalDollars: 17, hasHandwrittenAmounts: true }),
            receipt_lines: linesContent({ grandTotalDollars: 17, tipDollars: 5 }),
            receipt_totals_block: JSON.stringify({
                rows: [{ role: 'subtotal', label: 'Subtotal', writtenText: '12.66', medium: 'printed' }],
            }),
            receipt_row_read: JSON.stringify({ marksPresent: true, writtenText: '5.00' }),
        });
        const result = await extractReceipt({
            frames: [processed],
            apiKey: 'test-key',
            // The advisory verify pass calls OpenRouter directly; it has its own tests.
            verify: false,
            prep: async () => processed,
            completeJson: async (input) => {
                if (input.schemaName === 'receipt_row_read' && input.system.includes('grand total')) {
                    throw new Error('timed out');
                }
                return paid(input);
            },
        });
        warn.mockRestore();
        expect(result.kind).toBe('complete');
        if (result.kind !== 'complete') {
            return;
        }
        expect(JSON.parse(result.extractJson).error).toContain('handwritten totals: timed out');
        // Header, lines, totals block, and tip row each answered and were billed.
        expect(result.extractCostUsd).toBeCloseTo(0.004);
        expect(result.extractPromptTokens).toBe(400);
    });

    it('counts the cost of a reply that was billed but could not be parsed', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const result = await extractReceipt({
            frames: [processed],
            apiKey: 'test-key',
            // The advisory verify pass calls OpenRouter directly; it has its own tests.
            verify: false,
            prep: async () => processed,
            completeJson: completeJsonReturning({ receipt_headers: 'not json' }),
        });
        warn.mockRestore();
        expect(result.kind).toBe('complete');
        if (result.kind === 'complete') {
            expect(result.extractStatus).toBe('failed');
            expect(result.extractCostUsd).toBeCloseTo(0.001);
        }
    });

    it('sets totalsDisagree when header and line-vision totals differ', async () => {
        const result = await extractReceipt({
            frames: [processed],
            apiKey: 'test-key',
            // The advisory verify pass calls OpenRouter directly; it has its own tests.
            verify: false,
            prep: async () => processed,
            completeJson: completeJsonReturning({
                receipt_headers: headerContent(),
                receipt_lines: linesContent({ grandTotalDollars: 9 }),
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
            // The advisory verify pass calls OpenRouter directly; it has its own tests.
            verify: false,
            prep: async () => processed,
            completeJson: completeJsonReturning({
                receipt_headers: headerContent({
                    vendor: null,
                    purchaseDate: null,
                    grandTotalDollars: null,
                }),
                receipt_lines: linesContent({
                    vendor: null,
                    purchaseDate: null,
                    grandTotalDollars: null,
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
            // The advisory verify pass calls OpenRouter directly; it has its own tests.
            verify: false,
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
            // The advisory verify pass calls OpenRouter directly; it has its own tests.
            verify: false,
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
