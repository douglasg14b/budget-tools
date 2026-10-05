import {
    getOpenRouterApiKey,
    OPENROUTER_BASE_URL,
    OPENROUTER_DECISIONS_MODEL,
    OPENROUTER_MODEL,
    OPENROUTER_RECEIPT_REPAIR_MODEL,
    RECEIPT_VERIFY_ENABLED,
} from '../../environment';
import { isAmazonTransaction } from '../amazonClassify/isAmazonTransaction';
import { LlmSuggestError } from '../categorization/llm/LlmSuggestError';
import type { OpenRouterUsage } from '../categorization/llm/openRouterClient';
import { completeOpenRouterJson } from '../categorization/llm/openRouterClient';
import type { ReceiptExtractStatus } from './data/receiptsSchema';
import type { ReceiptExtractPayload } from './parseReceiptExtract';
import { formatReceiptExtractDump } from './parseReceiptExtract';
import type { ArithmeticGateInput, ReceiptExtractLine } from './pipeline/arithmeticGate';
import { arithmeticGate, printedTotalsDisagree } from './pipeline/arithmeticGate';
import { jpegDataUrl, prepReceiptImage } from './pipeline/prepReceiptImage';
import type { CompleteOpenRouterJson, ReceiptHeaderVision, ReceiptLinesVision } from './pipeline/receiptHeaderVision';
import {
    RECEIPT_HEADER_TIMEOUT_MS,
    RECEIPT_LINES_TIMEOUT_MS,
    readReceiptHeaders,
    readReceiptLines,
} from './pipeline/receiptHeaderVision';
import type { HandwrittenTotalsSettlement } from './pipeline/settleHandwrittenTotals';
import { RECEIPT_SETTLE_TIMEOUT_MS, settleHandwrittenTotals } from './pipeline/settleHandwrittenTotals';
import type { ReceiptVerifyFlag } from './pipeline/verifyReceiptExtract';
import { verifyReceiptExtract } from './pipeline/verifyReceiptExtract';

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
    /** Off by default in tests so the extract pipeline stays offline-testable. */
    readonly verify?: boolean;
    readonly verifyModel?: string;
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
    const meter = meterUsage(input.completeJson ?? completeOpenRouterJson);
    const prep = input.prep ?? defaultPrep;
    const processed = await prep(input.frames);
    const processedDataUrl = jpegDataUrl(processed);
    const visionBase = {
        apiKey,
        baseUrl: input.baseUrl ?? OPENROUTER_BASE_URL,
        completeJson: meter.completeJson,
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
        return completeHeaderOnly(headerAttempt, meter.usages);
    }

    const header = headerAttempt.header ?? emptyHeader();
    let error = headerAttempt.error;
    let linesVision: ReceiptLinesVision | null = null;
    let repaired = false;

    if (headerAttempt.error == null) {
        const linesAttempt = await tryReadLines({
            ...visionBase,
            model: input.repairModel ?? OPENROUTER_RECEIPT_REPAIR_MODEL,
            timeoutMs: input.repairTimeoutMs ?? RECEIPT_LINES_TIMEOUT_MS,
            expectedPrintedMilliunits: header.printedMilliunits,
        });
        error = joinErrors(error, linesAttempt.error);
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
    const readMilliunits = header.printedMilliunits ?? linesVision?.printedMilliunits ?? null;
    const lines = linesVision?.lines ?? [];
    const taxMilliunits = linesVision?.taxMilliunits ?? 0;
    const discountMilliunits = linesVision?.discountMilliunits ?? 0;
    if (isAmazonReceiptVendor(vendor)) {
        return { kind: 'amazon' };
    }
    const readTotalsDisagree = printedTotalsDisagree(header.printedMilliunits, linesVision?.printedMilliunits ?? null);

    // The line read's tip is only a signal that a tip exists. The stored tip always comes from the
    // settle pass, which requires marks on the tip row — so a tip is never invented.
    const settleAttempt =
        linesVision && ((linesVision.tipMilliunits ?? 0) > 0 || header.hasHandwrittenAmounts || readTotalsDisagree)
            ? await trySettle({
                  ...visionBase,
                  model: input.repairModel ?? OPENROUTER_RECEIPT_REPAIR_MODEL,
                  timeoutMs: input.repairTimeoutMs ?? RECEIPT_SETTLE_TIMEOUT_MS,
              })
            : null;
    const settlement = settleAttempt?.settlement ?? null;
    if (settleAttempt) {
        error = joinErrors(error, settleAttempt.error);
    }
    // A settled total replaces the first read only when its own arithmetic closes.
    const settledTotal = settlement?.consistent ? settlement.totalMilliunits : null;
    const printedMilliunits = settledTotal ?? readMilliunits;
    const tipMilliunits = settlement?.tipMilliunits ?? 0;

    const gated =
        gateMatches({ lines, taxMilliunits, discountMilliunits, tipMilliunits }, printedMilliunits) ||
        // Card slips often have no item lines at all; then the totals block is the arithmetic.
        (settledTotal != null && lines.length === 0);
    const totalsDisagree = settledTotal == null && readTotalsDisagree;
    const hasKeys = Boolean(vendor && purchaseDate && printedMilliunits != null);
    const extractStatus: ReceiptExtractStatus = !hasKeys ? 'failed' : gated && !totalsDisagree ? 'gated' : 'ungated';

    const verifyFlags = await tryVerify(meter.usages, {
        enabled: input.verify ?? RECEIPT_VERIFY_ENABLED,
        apiKey,
        model: input.verifyModel ?? OPENROUTER_DECISIONS_MODEL,
        vendor,
        printedMilliunits,
        lines,
        taxMilliunits,
        discountMilliunits,
        tipMilliunits,
    });

    const payload: ReceiptExtractPayload = {
        repaired,
        gated,
        headerPrintedMilliunits: header.printedMilliunits,
        ocrPrintedMilliunits: linesVision?.printedMilliunits ?? null,
        taxMilliunits,
        discountMilliunits,
        tipMilliunits,
        lines,
        error,
        ...(verifyFlags ? { verifyFlags } : {}),
        ...(settlement ? { handwrittenTotals: settlement } : {}),
    };

    return {
        kind: 'complete',
        extractStatus,
        vendor,
        purchaseDate,
        printedMilliunits,
        totalsDisagree,
        extractJson: JSON.stringify(payload),
        rawText: formatReceiptExtractDump(lines, taxMilliunits, discountMilliunits, tipMilliunits),
        ...totalUsage(meter.usages),
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
        tipMilliunits: 0,
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

function completeHeaderOnly(attempt: HeaderAttempt, usages: Usages): ReceiptExtractComplete {
    const header = attempt.header ?? emptyHeader();
    const hasKeys = Boolean(header.vendor && header.purchaseDate && header.printedMilliunits != null);
    const payload: ReceiptExtractPayload = {
        repaired: false,
        gated: false,
        headerPrintedMilliunits: header.printedMilliunits,
        ocrPrintedMilliunits: null,
        taxMilliunits: 0,
        discountMilliunits: 0,
        tipMilliunits: 0,
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
        ...totalUsage(usages),
    };
}

type Usages = (OpenRouterUsage | null)[];

/**
 * Records the usage of every answered call. A reply that fails to parse, or a call whose sibling
 * throws, was still billed, so cost is counted here rather than from the calls that succeeded.
 */
function meterUsage(completeJson: CompleteOpenRouterJson): {
    readonly completeJson: CompleteOpenRouterJson;
    readonly usages: Usages;
} {
    const usages: Usages = [];
    return {
        usages,
        completeJson: async (request) => {
            const result = await completeJson(request);
            usages.push(result.usage);
            return result;
        },
    };
}

function totalUsage(
    usages: Usages,
): Pick<ReceiptExtractComplete, 'extractCostUsd' | 'extractPromptTokens' | 'extractCompletionTokens'> {
    let costUsd: number | null = null;
    let promptTokens: number | null = null;
    let completionTokens: number | null = null;
    for (const usage of usages) {
        costUsd = sumNullable(costUsd, usage?.costUsd ?? null);
        promptTokens = sumNullable(promptTokens, usage?.promptTokens ?? null);
        completionTokens = sumNullable(completionTokens, usage?.completionTokens ?? null);
    }
    return { extractCostUsd: costUsd, extractPromptTokens: promptTokens, extractCompletionTokens: completionTokens };
}

/**
 * Advisory only. A verification failure must never cost us a good extract, so
 * every error path returns undefined — which parseReceiptExtract keeps distinct
 * from an empty flag list. Its usage joins the receipt's total like any other call.
 */
async function tryVerify(
    usages: Usages,
    input: {
        readonly enabled: boolean;
        readonly apiKey: string;
        readonly model: string;
        readonly vendor: string | null;
        readonly printedMilliunits: number | null;
        readonly lines: readonly ReceiptExtractLine[];
        readonly taxMilliunits: number;
        readonly discountMilliunits: number;
        readonly tipMilliunits: number;
    },
): Promise<readonly ReceiptVerifyFlag[] | undefined> {
    if (!input.enabled || !input.vendor) {
        return undefined;
    }
    try {
        const result = await verifyReceiptExtract(input);
        usages.push(result.usage);
        return result.flags;
    } catch (error) {
        console.warn('receipt extract verification failed', errorMessage(error));
        return undefined;
    }
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
    amounts: Omit<ArithmeticGateInput, 'printedMilliunits'>,
    printedMilliunits: number | null,
): boolean {
    if (printedMilliunits == null) {
        return false;
    }
    return arithmeticGate({ ...amounts, printedMilliunits }).gated;
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
};

async function tryReadHeaders(input: Parameters<typeof readReceiptHeaders>[0]): Promise<HeaderAttempt> {
    try {
        const result = await readReceiptHeaders(input);
        return { header: result.header, error: null };
    } catch (error) {
        const message = errorMessage(error);
        console.warn('receipt header vision failed', message);
        return { header: null, error: message };
    }
}

type SettleAttempt = {
    settlement: HandwrittenTotalsSettlement | null;
    error: string | null;
};

/** A failed settle stores no tip: an unverified tip is exactly what the pass exists to keep out. */
async function trySettle(input: Parameters<typeof settleHandwrittenTotals>[0]): Promise<SettleAttempt> {
    try {
        const result = await settleHandwrittenTotals(input);
        return { settlement: result.settlement, error: null };
    } catch (error) {
        const message = errorMessage(error);
        console.warn('receipt handwritten totals failed', message);
        return { settlement: null, error: `handwritten totals: ${message}` };
    }
}

type LinesAttempt = {
    lines: ReceiptLinesVision | null;
    error: string | null;
};

async function tryReadLines(input: Parameters<typeof readReceiptLines>[0]): Promise<LinesAttempt> {
    try {
        const result = await readReceiptLines(input);
        return { lines: result.lines, error: null };
    } catch (error) {
        const message = errorMessage(error);
        console.warn('receipt line vision failed', message);
        return { lines: null, error: message };
    }
}
