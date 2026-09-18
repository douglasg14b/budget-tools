import {
    getOpenRouterApiKey,
    OPENROUTER_BASE_URL,
    OPENROUTER_MODEL,
    OPENROUTER_RECEIPT_REPAIR_MODEL,
} from '../../environment';
import { isAmazonTransaction } from '../amazonClassify/isAmazonTransaction';
import { LlmSuggestError } from '../categorization/llm/LlmSuggestError';
import type { OpenRouterUsage } from '../categorization/llm/openRouterClient';
import { completeOpenRouterJson } from '../categorization/llm/openRouterClient';
import type { ReceiptExtractStatus } from './data/receiptsSchema';
import type { ReceiptExtractPayload } from './parseReceiptExtract';
import { formatReceiptExtractDump } from './parseReceiptExtract';
import type { ReceiptExtractLine } from './pipeline/arithmeticGate';
import { arithmeticGate, printedTotalsDisagree } from './pipeline/arithmeticGate';
import { jpegDataUrl, prepReceiptImage } from './pipeline/prepReceiptImage';
import type { CompleteOpenRouterJson, ReceiptHeaderVision, ReceiptLinesVision } from './pipeline/receiptHeaderVision';
import {
    RECEIPT_HEADER_TIMEOUT_MS,
    RECEIPT_LINES_TIMEOUT_MS,
    readReceiptHeaders,
    readReceiptLines,
} from './pipeline/receiptHeaderVision';

export type { ReceiptExtractPayload } from './parseReceiptExtract';

export type ReceiptExtractComplete = {
    readonly kind: 'complete';
    readonly extractStatus: ReceiptExtractStatus;
    readonly vendor: string | null;
    readonly purchaseDate: string | null;
    readonly printedMilliunits: number | null;
    readonly totalsDisagree: boolean;
    readonly extractJson: string;
    readonly rawText: string | null;
    readonly extractCostUsd: number | null;
    readonly extractPromptTokens: number | null;
    readonly extractCompletionTokens: number | null;
};

export type ReceiptExtractAmazon = {
    readonly kind: 'amazon';
};

export type ReceiptExtractResult = ReceiptExtractComplete | ReceiptExtractAmazon;

export type ExtractFramesFn = (input: { readonly frames: readonly Buffer[] }) => Promise<ReceiptExtractResult>;

export type ExtractReceiptInput = {
    readonly frames: readonly Buffer[];
    readonly completeJson?: CompleteOpenRouterJson;
    readonly prep?: (frames: readonly Buffer[]) => Promise<Buffer>;
    readonly apiKey?: string;
    readonly headerModel?: string;
    readonly repairModel?: string;
    readonly baseUrl?: string;
    readonly headerTimeoutMs?: number;
    readonly repairTimeoutMs?: number;
    /** Re-read only receipt match keys, preserving prior line-item extraction. */
    readonly headerOnly?: boolean;
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
 * Prep → cheap vision headers → schema-constrained vision lines → arithmetic gate.
 * Processed bytes go to OpenRouter, not the stored original.
 */
export async function extractReceipt(input: ExtractReceiptInput): Promise<ReceiptExtractResult> {
    const apiKey = input.apiKey ?? requireOpenRouterApiKey();
    const completeJson = input.completeJson ?? completeOpenRouterJson;
    const prep = input.prep ?? defaultPrep;
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
    if (input.headerOnly) {
        return completeHeaderOnly(headerAttempt);
    }

    const header = headerAttempt.header ?? emptyHeader();
    let error = headerAttempt.error;
    let linesVision: ReceiptLinesVision | null = null;
    let repaired = false;
    let costUsd = headerAttempt.usage?.costUsd ?? null;
    let promptTokens = headerAttempt.usage?.promptTokens ?? null;
    let completionTokens = headerAttempt.usage?.completionTokens ?? null;

    if (headerAttempt.error == null) {
        const linesAttempt = await tryReadLines({
            ...visionBase,
            model: input.repairModel ?? OPENROUTER_RECEIPT_REPAIR_MODEL,
            timeoutMs: input.repairTimeoutMs ?? RECEIPT_LINES_TIMEOUT_MS,
            expectedPrintedMilliunits: header.printedMilliunits,
        });
        error = joinErrors(error, linesAttempt.error);
        costUsd = sumNullable(costUsd, linesAttempt.usage?.costUsd ?? null);
        promptTokens = sumNullable(promptTokens, linesAttempt.usage?.promptTokens ?? null);
        completionTokens = sumNullable(completionTokens, linesAttempt.usage?.completionTokens ?? null);
        if (linesAttempt.lines) {
            repaired = true;
            linesVision = linesAttempt.lines;
            if (isAmazonReceiptVendor(linesVision.vendor)) {
                return { kind: 'amazon' };
            }
        }
    }

    const vendor = header.vendor ?? linesVision?.vendor ?? null;
    const purchaseDate = header.purchaseDate ?? linesVision?.purchaseDate ?? null;
    const printedMilliunits = header.printedMilliunits ?? linesVision?.printedMilliunits ?? null;
    const lines = linesVision?.lines ?? [];
    const taxMilliunits = linesVision?.taxMilliunits ?? 0;
    const discountMilliunits = linesVision?.discountMilliunits ?? 0;
    if (isAmazonReceiptVendor(vendor)) {
        return { kind: 'amazon' };
    }

    const gated = gateMatches(lines, taxMilliunits, discountMilliunits, printedMilliunits);
    const totalsDisagree = printedTotalsDisagree(header.printedMilliunits, linesVision?.printedMilliunits ?? null);
    const hasKeys = Boolean(vendor && purchaseDate && printedMilliunits != null);
    const extractStatus: ReceiptExtractStatus = !hasKeys ? 'failed' : gated && !totalsDisagree ? 'gated' : 'ungated';

    const payload: ReceiptExtractPayload = {
        repaired,
        gated,
        headerPrintedMilliunits: header.printedMilliunits,
        ocrPrintedMilliunits: linesVision?.printedMilliunits ?? null,
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
        rawText: formatReceiptExtractDump(lines, taxMilliunits, discountMilliunits),
        extractCostUsd: costUsd,
        extractPromptTokens: promptTokens,
        extractCompletionTokens: completionTokens,
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
        extractCostUsd: null,
        extractPromptTokens: null,
        extractCompletionTokens: null,
    };
}

function completeHeaderOnly(attempt: HeaderAttempt): ReceiptExtractComplete {
    const header = attempt.header ?? emptyHeader();
    const hasKeys = Boolean(header.vendor && header.purchaseDate && header.printedMilliunits != null);
    const payload: ReceiptExtractPayload = {
        repaired: false,
        gated: false,
        headerPrintedMilliunits: header.printedMilliunits,
        ocrPrintedMilliunits: null,
        taxMilliunits: 0,
        discountMilliunits: 0,
        lines: [],
        error: attempt.error,
    };
    return {
        kind: 'complete',
        extractStatus: hasKeys ? 'ungated' : 'failed',
        vendor: header.vendor,
        purchaseDate: header.purchaseDate,
        printedMilliunits: header.printedMilliunits,
        totalsDisagree: false,
        extractJson: JSON.stringify(payload),
        rawText: null,
        extractCostUsd: attempt.usage?.costUsd ?? null,
        extractPromptTokens: attempt.usage?.promptTokens ?? null,
        extractCompletionTokens: attempt.usage?.completionTokens ?? null,
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

/** Adds two optional accumulators, treating a missing value as 0 but preserving null when both are null. */
function sumNullable(left: number | null, right: number | null): number | null {
    if (left == null && right == null) {
        return null;
    }
    return (left ?? 0) + (right ?? 0);
}

type HeaderAttempt = {
    header: ReceiptHeaderVision | null;
    error: string | null;
    usage: OpenRouterUsage | null;
};

async function tryReadHeaders(input: Parameters<typeof readReceiptHeaders>[0]): Promise<HeaderAttempt> {
    try {
        const result = await readReceiptHeaders(input);
        return { header: result.header, error: null, usage: result.usage };
    } catch (error) {
        const message = errorMessage(error);
        console.warn('receipt header vision failed', message);
        return { header: null, error: message, usage: null };
    }
}

type LinesAttempt = {
    lines: ReceiptLinesVision | null;
    error: string | null;
    usage: OpenRouterUsage | null;
};

async function tryReadLines(input: Parameters<typeof readReceiptLines>[0]): Promise<LinesAttempt> {
    try {
        const result = await readReceiptLines(input);
        return { lines: result.lines, error: null, usage: result.usage };
    } catch (error) {
        const message = errorMessage(error);
        console.warn('receipt line vision failed', message);
        return { lines: null, error: message, usage: null };
    }
}
