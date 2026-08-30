import {
    getOpenRouterApiKey,
    OPENROUTER_BASE_URL,
    OPENROUTER_MODEL,
    OPENROUTER_RECEIPT_REPAIR_MODEL,
} from '../../environment';
import { isAmazonTransaction } from '../amazonClassify/isAmazonTransaction';
import { LlmSuggestError } from '../categorization/llm/LlmSuggestError';
import { completeOpenRouterJson } from '../categorization/llm/openRouterClient';
import type { ReceiptExtractStatus } from './data/receiptsSchema';
import type { ReceiptExtractLine } from './pipeline/arithmeticGate';
import { arithmeticGate, printedTotalsDisagree } from './pipeline/arithmeticGate';
import type { OcrReceiptResult } from './pipeline/ocrReceiptLines';
import { ocrReceiptLines } from './pipeline/ocrReceiptLines';
import { jpegDataUrl, prepReceiptImage } from './pipeline/prepReceiptImage';
import type { CompleteOpenRouterJson, ReceiptHeaderVision } from './pipeline/receiptHeaderVision';
import {
    RECEIPT_HEADER_TIMEOUT_MS,
    RECEIPT_REPAIR_TIMEOUT_MS,
    readReceiptHeaders,
    repairReceiptExtract,
} from './pipeline/receiptHeaderVision';

export type ReceiptExtractPayload = {
    readonly repaired: boolean;
    readonly gated: boolean;
    readonly headerPrintedMilliunits: number | null;
    readonly ocrPrintedMilliunits: number | null;
    readonly taxMilliunits: number;
    readonly discountMilliunits: number;
    readonly lines: ReceiptExtractLine[];
    readonly error: string | null;
};

export type ReceiptExtractComplete = {
    readonly kind: 'complete';
    readonly extractStatus: ReceiptExtractStatus;
    readonly vendor: string | null;
    readonly purchaseDate: string | null;
    readonly printedMilliunits: number | null;
    readonly totalsDisagree: boolean;
    readonly extractJson: string;
    readonly rawText: string | null;
};

export type ReceiptExtractAmazon = {
    readonly kind: 'amazon';
};

export type ReceiptExtractResult = ReceiptExtractComplete | ReceiptExtractAmazon;

export type ExtractFramesFn = (input: { readonly frames: readonly Buffer[] }) => Promise<ReceiptExtractResult>;

export type ExtractReceiptInput = {
    readonly frames: readonly Buffer[];
    readonly completeJson?: CompleteOpenRouterJson;
    readonly ocr?: (processedJpeg: Buffer) => Promise<OcrReceiptResult>;
    readonly prep?: (frames: readonly Buffer[]) => Promise<Buffer>;
    readonly apiKey?: string;
    readonly headerModel?: string;
    readonly repairModel?: string;
    readonly baseUrl?: string;
    readonly headerTimeoutMs?: number;
    readonly repairTimeoutMs?: number;
};

/**
 * True when extracted vendor text looks like Amazon (same haystack as bank Amazon skip).
 */
export function isAmazonReceiptVendor(vendor: string | null): boolean {
    return isAmazonTransaction({
        payeeName: vendor,
        importPayeeName: null,
        importPayeeNameOriginal: null,
    });
}

/**
 * Prep → cheap vision headers → local OCR lines → arithmetic gate → one repair.
 * Processed bytes go to OpenRouter and OCR, not the stored original.
 */
export async function extractReceipt(input: ExtractReceiptInput): Promise<ReceiptExtractResult> {
    const apiKey = input.apiKey ?? requireOpenRouterApiKey();
    const completeJson = input.completeJson ?? completeOpenRouterJson;
    const prep = input.prep ?? defaultPrep;
    const ocr = input.ocr ?? ocrReceiptLines;
    const processed = await prep(input.frames);
    const processedDataUrl = jpegDataUrl(processed);
    const visionBase = {
        apiKey,
        baseUrl: input.baseUrl ?? OPENROUTER_BASE_URL,
        completeJson,
        processedDataUrl,
    };

    const headerAttempt = await tryReadHeaders({
        ...visionBase,
        model: input.headerModel ?? OPENROUTER_MODEL,
        timeoutMs: input.headerTimeoutMs ?? RECEIPT_HEADER_TIMEOUT_MS,
    });
    if (headerAttempt.header && isAmazonReceiptVendor(headerAttempt.header.vendor)) {
        return { kind: 'amazon' };
    }

    const ocrAttempt = await tryOcr(ocr, processed);
    const header = headerAttempt.header ?? emptyHeader();
    const ocrResult = ocrAttempt.result ?? emptyOcr();
    if (!header.vendor && ocrLooksLikeAmazon(ocrResult)) {
        return { kind: 'amazon' };
    }

    let vendor = header.vendor;
    let purchaseDate = header.purchaseDate;
    const printedMilliunits = header.printedMilliunits ?? ocrResult.printedMilliunits;
    let lines = ocrResult.lines;
    let taxMilliunits = ocrResult.taxMilliunits;
    let discountMilliunits = ocrResult.discountMilliunits;
    let repaired = false;
    let error = joinErrors(headerAttempt.error, ocrAttempt.error);

    let gated = gateMatches(lines, taxMilliunits, discountMilliunits, printedMilliunits);
    let totalsDisagree = printedTotalsDisagree(header.printedMilliunits, ocrResult.printedMilliunits);
    // Header/OCR total mismatch warrants repair even when line arithmetic already gates.
    const shouldRepair = printedMilliunits != null && (!gated || totalsDisagree);

    if (shouldRepair) {
        const repairAttempt = await tryRepair({
            ...visionBase,
            model: input.repairModel ?? OPENROUTER_RECEIPT_REPAIR_MODEL,
            timeoutMs: input.repairTimeoutMs ?? RECEIPT_REPAIR_TIMEOUT_MS,
            expectedPrintedMilliunits: printedMilliunits,
            ocrDump: ocrResult.rawText,
        });
        if (repairAttempt.repair) {
            repaired = true;
            vendor = repairAttempt.repair.vendor ?? vendor;
            purchaseDate = repairAttempt.repair.purchaseDate ?? purchaseDate;
            if (isAmazonReceiptVendor(vendor)) {
                return { kind: 'amazon' };
            }
            lines = repairAttempt.repair.lines;
            taxMilliunits = repairAttempt.repair.taxMilliunits;
            discountMilliunits = repairAttempt.repair.discountMilliunits;
            gated = gateMatches(lines, taxMilliunits, discountMilliunits, printedMilliunits);
            totalsDisagree = printedTotalsDisagree(printedMilliunits, ocrResult.printedMilliunits);
        } else {
            error = joinErrors(error, repairAttempt.error);
        }
    }

    const hasKeys = Boolean(vendor && purchaseDate && printedMilliunits != null);
    const extractStatus: ReceiptExtractStatus = !hasKeys ? 'failed' : gated && !totalsDisagree ? 'gated' : 'ungated';

    const payload: ReceiptExtractPayload = {
        repaired,
        gated,
        headerPrintedMilliunits: header.printedMilliunits,
        ocrPrintedMilliunits: ocrResult.printedMilliunits,
        taxMilliunits,
        discountMilliunits,
        lines,
        error,
    };

    return {
        kind: 'complete',
        extractStatus,
        vendor,
        purchaseDate,
        printedMilliunits,
        totalsDisagree,
        extractJson: JSON.stringify(payload),
        rawText: ocrResult.rawText || null,
    };
}

/**
 * Loud extract failure with no invented match keys. Used when extract throws before a payload exists.
 */
export function buildFailedReceiptExtract(message: string): ReceiptExtractComplete {
    const payload: ReceiptExtractPayload = {
        repaired: false,
        gated: false,
        headerPrintedMilliunits: null,
        ocrPrintedMilliunits: null,
        taxMilliunits: 0,
        discountMilliunits: 0,
        lines: [],
        error: message,
    };
    return {
        kind: 'complete',
        extractStatus: 'failed',
        vendor: null,
        purchaseDate: null,
        printedMilliunits: null,
        totalsDisagree: false,
        extractJson: JSON.stringify(payload),
        rawText: null,
    };
}

function requireOpenRouterApiKey(): string {
    const apiKey = getOpenRouterApiKey();
    if (!apiKey) {
        throw new LlmSuggestError(503, 'OPENROUTER_API_KEY is not configured');
    }
    return apiKey;
}

async function defaultPrep(frames: readonly Buffer[]): Promise<Buffer> {
    return prepReceiptImage({ frames });
}

function emptyHeader(): ReceiptHeaderVision {
    return { vendor: null, purchaseDate: null, printedMilliunits: null };
}

function emptyOcr(): OcrReceiptResult {
    return { rawText: '', lines: [], taxMilliunits: 0, discountMilliunits: 0, printedMilliunits: null };
}

function gateMatches(
    lines: readonly ReceiptExtractLine[],
    taxMilliunits: number,
    discountMilliunits: number,
    printedMilliunits: number | null,
): boolean {
    if (printedMilliunits == null) {
        return false;
    }
    return arithmeticGate({ lines, taxMilliunits, discountMilliunits, printedMilliunits }).gated;
}

function joinErrors(left: string | null, right: string | null): string | null {
    if (left && right) {
        return `${left}; ${right}`;
    }
    return left ?? right;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

type HeaderAttempt = { header: ReceiptHeaderVision | null; error: string | null };

async function tryReadHeaders(input: Parameters<typeof readReceiptHeaders>[0]): Promise<HeaderAttempt> {
    try {
        return { header: await readReceiptHeaders(input), error: null };
    } catch (error) {
        const message = errorMessage(error);
        console.warn('receipt header vision failed', message);
        return { header: null, error: message };
    }
}

type OcrAttempt = { result: OcrReceiptResult | null; error: string | null };

async function tryOcr(
    ocr: (processedJpeg: Buffer) => Promise<OcrReceiptResult>,
    processed: Buffer,
): Promise<OcrAttempt> {
    try {
        return { result: await ocr(processed), error: null };
    } catch (error) {
        const message = errorMessage(error);
        console.warn('receipt OCR failed', message);
        return { result: null, error: message };
    }
}

type RepairAttempt = {
    repair: Awaited<ReturnType<typeof repairReceiptExtract>> | null;
    error: string | null;
};

async function tryRepair(input: Parameters<typeof repairReceiptExtract>[0]): Promise<RepairAttempt> {
    try {
        return { repair: await repairReceiptExtract(input), error: null };
    } catch (error) {
        const message = errorMessage(error);
        console.warn('receipt extract repair failed', message);
        return { repair: null, error: message };
    }
}

function ocrLooksLikeAmazon(ocr: OcrReceiptResult): boolean {
    if (isAmazonReceiptVendor(ocr.rawText)) {
        return true;
    }
    const firstLines = ocr.lines
        .slice(0, 8)
        .map((line) => line.name)
        .join(' ');
    return isAmazonReceiptVendor(firstLines);
}
