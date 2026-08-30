import { createWorker } from 'tesseract.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { discardOcrWorker, ocrReceiptLines, parseOcrReceiptText } from '../ocrReceiptLines';

vi.mock('tesseract.js', () => ({
    createWorker: vi.fn(),
}));

const recognize = vi.fn();
const terminate = vi.fn(async () => undefined);
const mockedCreateWorker = vi.mocked(createWorker);

describe('parseOcrReceiptText', () => {
    it('reads item amounts, tax, discount, and a total line', () => {
        const parsed = parseOcrReceiptText('dump', [
            { text: 'Latte 4.50' },
            { text: 'Muffin $3.20' },
            { text: 'Tax 0.62' },
            { text: 'Discount 0.20' },
            { text: 'Subtotal 7.70' },
            { text: 'Total $8.12' },
        ]);
        expect(parsed.lines).toEqual([
            { name: 'Latte', amountMilliunits: 4500, quantity: null },
            { name: 'Muffin', amountMilliunits: 3200, quantity: null },
        ]);
        expect(parsed.taxMilliunits).toBe(620);
        expect(parsed.discountMilliunits).toBe(200);
        expect(parsed.printedMilliunits).toBe(8120);
        expect(parsed.rawText).toBe('dump');
    });

    it('skips lines without a trailing money amount', () => {
        const parsed = parseOcrReceiptText('Cafe', [{ text: 'Cafe Rio' }, { text: 'Thank you' }]);
        expect(parsed.lines).toEqual([]);
        expect(parsed.printedMilliunits).toBeNull();
    });

    it('treats coupon savings as a positive discount', () => {
        const parsed = parseOcrReceiptText('x', [{ text: 'Coupon savings -1.00' }]);
        expect(parsed.discountMilliunits).toBe(1000);
        expect(parsed.lines).toEqual([]);
    });

    it('reads a trailing amount when OCR inserts spaces around the decimal', () => {
        const parsed = parseOcrReceiptText('x', [{ text: 'Latte 4 .50' }, { text: 'Grand Total 8 .12' }]);
        expect(parsed.lines).toEqual([{ name: 'Latte', amountMilliunits: 4500, quantity: null }]);
        expect(parsed.printedMilliunits).toBe(8120);
    });
});

describe('ocrReceiptLines', () => {
    afterEach(async () => {
        await discardOcrWorker();
        recognize.mockReset();
        terminate.mockClear();
        mockedCreateWorker.mockReset();
    });

    it('reuses one worker on success and does not terminate it', async () => {
        mockedCreateWorker.mockImplementation(async () => ({ recognize, terminate }) as never);
        recognize.mockResolvedValue({
            data: {
                text: 'Latte 4.50\nTotal 4.50',
                lines: [{ text: 'Latte 4.50' }, { text: 'Total 4.50' }],
            },
        });
        const first = await ocrReceiptLines(Buffer.from('jpeg-a'));
        const second = await ocrReceiptLines(Buffer.from('jpeg-b'));
        expect(first.printedMilliunits).toBe(4500);
        expect(second.printedMilliunits).toBe(4500);
        expect(mockedCreateWorker).toHaveBeenCalledTimes(1);
        expect(mockedCreateWorker.mock.calls[0]?.[0]).toBe('eng');
        expect(terminate).not.toHaveBeenCalled();
    });

    it('terminates the worker when recognize fails', async () => {
        mockedCreateWorker.mockImplementation(async () => ({ recognize, terminate }) as never);
        recognize.mockRejectedValue(new Error('boom'));
        await expect(ocrReceiptLines(Buffer.from('jpeg'))).rejects.toMatchObject({
            statusCode: 503,
            message: expect.stringContaining('Receipt OCR failed'),
        });
        expect(terminate).toHaveBeenCalledTimes(1);
    });

    it('parses from raw text when tesseract omits line boxes', async () => {
        mockedCreateWorker.mockImplementation(async () => ({ recognize, terminate }) as never);
        recognize.mockResolvedValue({
            data: { text: 'Latte 4.50\nTotal 4.50' },
        });
        const parsed = await ocrReceiptLines(Buffer.from('jpeg'));
        expect(parsed.lines).toEqual([{ name: 'Latte', amountMilliunits: 4500, quantity: null }]);
        expect(parsed.printedMilliunits).toBe(4500);
    });
});
