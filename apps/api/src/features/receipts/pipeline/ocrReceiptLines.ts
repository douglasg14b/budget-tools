import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { getReceiptsDir } from '../../../environment';
import { moneyToMilliunits } from '../../amazonOrders/moneyToMilliunits';
import { HttpError } from '../../travelWindows/HttpError';
import type { ReceiptExtractLine } from './arithmeticGate';

export type OcrLineText = {
    readonly text: string;
};

export type OcrReceiptResult = {
    readonly rawText: string;
    readonly lines: ReceiptExtractLine[];
    readonly taxMilliunits: number;
    readonly discountMilliunits: number;
    readonly printedMilliunits: number | null;
};

const TRAILING_MONEY = /\$?\s*(-?\d{1,3}(?:,\d{3})*(?:\s*\.\s*\d{2})|-?\d+\s*\.\s*\d{2})\s*$/;
const TAX_LINE = /\btax\b/i;
const DISCOUNT_LINE = /\b(discount|coupon|savings?)\b/i;
const TOTAL_LINE = /\b((grand\s+)?total|amount\s+due|balance\s+due)\b/i;
const SUBTOTAL_LINE = /\bsub\s*-?\s*total\b/i;

type TesseractRecognizeResult = {
    readonly data: { readonly text: string } & TesseractPageLike;
};

type TesseractWorker = {
    recognize: (image: Buffer) => Promise<TesseractRecognizeResult>;
    terminate: () => Promise<unknown>;
};

let workerPromise: Promise<TesseractWorker> | null = null;
let ocrMutex: Promise<void> = Promise.resolve();

/**
 * Maps OCR line text into item lines, tax, discount, and a TOTAL amount when present.
 */
export function parseOcrReceiptText(rawText: string, lineTexts: readonly OcrLineText[]): OcrReceiptResult {
    const lines: ReceiptExtractLine[] = [];
    let taxMilliunits = 0;
    let discountMilliunits = 0;
    let printedMilliunits: number | null = null;
    for (const line of lineTexts) {
        const text = line.text.replace(/\s+/g, ' ').trim();
        if (!text) {
            continue;
        }
        const amountMilliunits = trailingMoneyMilliunits(text);
        if (SUBTOTAL_LINE.test(text)) {
            continue;
        }
        if (TAX_LINE.test(text) && amountMilliunits != null) {
            taxMilliunits += amountMilliunits;
            continue;
        }
        if (DISCOUNT_LINE.test(text) && amountMilliunits != null) {
            discountMilliunits += Math.abs(amountMilliunits);
            continue;
        }
        if (TOTAL_LINE.test(text) && amountMilliunits != null) {
            printedMilliunits = amountMilliunits;
            continue;
        }
        if (amountMilliunits == null) {
            continue;
        }
        lines.push({
            name: itemNameFromLine(text),
            amountMilliunits,
            quantity: null,
        });
    }
    return {
        rawText,
        lines,
        taxMilliunits,
        discountMilliunits,
        printedMilliunits,
    };
}

/**
 * Local boxed OCR. Uses processed JPEG bytes, not the stored original.
 * One worker is reused and calls are serialized — household volume, not a pool.
 */
export async function ocrReceiptLines(processedJpeg: Buffer): Promise<OcrReceiptResult> {
    try {
        return await withOcrWorker(async (worker) => {
            const recognized = await worker.recognize(processedJpeg);
            const rawText = recognized.data.text.trim();
            return parseOcrReceiptText(rawText, flattenOcrLines(recognized.data, rawText));
        });
    } catch (error) {
        if (error instanceof HttpError) {
            throw error;
        }
        const detail = error instanceof Error ? error.message : String(error);
        throw new HttpError(503, `Receipt OCR failed: ${detail}`);
    }
}

async function withOcrWorker<T>(run: (worker: TesseractWorker) => Promise<T>): Promise<T> {
    let release: () => void = () => undefined;
    const previous = ocrMutex;
    ocrMutex = new Promise<void>((resolve) => {
        release = resolve;
    });
    await previous;
    try {
        const worker = await getOrCreateWorker();
        return await run(worker);
    } catch (error) {
        await discardOcrWorker();
        throw error;
    } finally {
        release();
    }
}

async function tesseractCacheDir(): Promise<string> {
    const directory = join(getReceiptsDir(), '..', 'tesseract');
    await mkdir(directory, { recursive: true });
    return directory;
}

async function getOrCreateWorker(): Promise<TesseractWorker> {
    if (!workerPromise) {
        workerPromise = (async () => {
            const { createWorker } = await import('tesseract.js');
            const cacheDir = await tesseractCacheDir();
            const worker = await createWorker('eng', undefined, {
                cachePath: cacheDir,
                langPath: cacheDir,
            });
            return {
                recognize: (image: Buffer) => worker.recognize(image) as Promise<TesseractRecognizeResult>,
                terminate: () => worker.terminate(),
            };
        })();
    }
    return workerPromise;
}

/** Terminates the shared worker so the next OCR recreates it. */
export async function discardOcrWorker(): Promise<void> {
    const pending = workerPromise;
    workerPromise = null;
    if (!pending) {
        return;
    }
    try {
        const worker = await pending;
        await worker.terminate();
    } catch {
        // Create or terminate already failed; the next OCR call creates a new worker.
    }
}

function trailingMoneyMilliunits(text: string): number | null {
    const match = TRAILING_MONEY.exec(text);
    if (!match?.[1]) {
        return null;
    }
    return moneyToMilliunits(match[1].replace(/[,\s]/g, ''));
}

function itemNameFromLine(text: string): string {
    const withoutAmount = text.replace(TRAILING_MONEY, '').trim();
    return withoutAmount || text;
}

type TesseractPageLike = {
    readonly text?: string;
    readonly lines?: readonly { readonly text: string }[] | null;
    readonly blocks?:
        | readonly {
              readonly paragraphs?: readonly {
                  readonly lines?: readonly { readonly text: string }[];
              }[];
          }[]
        | null;
};

function flattenOcrLines(page: TesseractPageLike, rawText: string): OcrLineText[] {
    if (page.lines?.length) {
        return page.lines.map((line) => ({ text: line.text }));
    }
    const fromBlocks: OcrLineText[] = [];
    for (const block of page.blocks ?? []) {
        for (const paragraph of block.paragraphs ?? []) {
            for (const line of paragraph.lines ?? []) {
                fromBlocks.push({ text: line.text });
            }
        }
    }
    if (fromBlocks.length > 0) {
        return fromBlocks;
    }
    return rawText.split(/\r?\n/).map((text) => ({ text }));
}
