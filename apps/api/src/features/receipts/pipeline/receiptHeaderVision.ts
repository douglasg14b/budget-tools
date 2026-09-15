import { isIsoDate } from '../../amazonOrders/isoDate';
import { moneyToMilliunits } from '../../amazonOrders/moneyToMilliunits';
import { LlmSuggestError } from '../../categorization/llm/LlmSuggestError';
import type {
    OpenRouterJsonInput,
    OpenRouterJsonResult,
    OpenRouterUsage,
} from '../../categorization/llm/openRouterClient';
import type { ReceiptExtractLine } from './arithmeticGate';

export const RECEIPT_HEADER_TIMEOUT_MS = 60_000;
export const RECEIPT_LINES_TIMEOUT_MS = 90_000;

export type ReceiptHeaderVision = {
    readonly vendor: string | null;
    readonly purchaseDate: string | null;
    readonly printedMilliunits: number | null;
};

export type ReceiptLinesVision = ReceiptHeaderVision & {
    readonly taxMilliunits: number;
    readonly discountMilliunits: number;
    readonly lines: ReceiptExtractLine[];
};

export type ReceiptHeaderVisionResult = {
    readonly header: ReceiptHeaderVision;
    readonly usage: OpenRouterUsage | null;
};

export type ReceiptLinesVisionResult = {
    readonly lines: ReceiptLinesVision;
    readonly usage: OpenRouterUsage | null;
};

export type CompleteOpenRouterJson = (input: OpenRouterJsonInput) => Promise<OpenRouterJsonResult>;

export type ReceiptHeaderVisionInput = {
    readonly apiKey: string;
    readonly baseUrl: string;
    readonly model: string;
    readonly timeoutMs: number;
    readonly processedDataUrl: string;
    readonly completeJson: CompleteOpenRouterJson;
};

export type ReceiptLinesVisionInput = ReceiptHeaderVisionInput & {
    readonly expectedPrintedMilliunits: number | null;
};

const HEADER_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        vendor: { type: ['string', 'null'] },
        purchaseDate: { type: ['string', 'null'] },
        printedTotalDollars: { type: ['number', 'null'] },
    },
    required: ['vendor', 'purchaseDate', 'printedTotalDollars'],
};

const REPAIR_LINE_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        name: { type: 'string' },
        amountDollars: { type: ['number', 'null'] },
        quantity: { type: ['number', 'null'] },
    },
    required: ['name', 'amountDollars', 'quantity'],
};

const REPAIR_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        vendor: { type: ['string', 'null'] },
        purchaseDate: { type: ['string', 'null'] },
        printedTotalDollars: { type: ['number', 'null'] },
        taxDollars: { type: ['number', 'null'] },
        discountDollars: { type: ['number', 'null'] },
        lines: { type: 'array', items: REPAIR_LINE_SCHEMA },
    },
    required: ['vendor', 'purchaseDate', 'printedTotalDollars', 'taxDollars', 'discountDollars', 'lines'],
};

/**
 * Cheap vision JSON for vendor, purchase date, and printed total.
 */
export async function readReceiptHeaders(input: ReceiptHeaderVisionInput): Promise<ReceiptHeaderVisionResult> {
    const { content, usage } = await input.completeJson({
        apiKey: input.apiKey,
        baseUrl: input.baseUrl,
        model: input.model,
        timeoutMs: input.timeoutMs,
        schemaName: 'receipt_headers',
        schema: HEADER_SCHEMA,
        system: 'Extract receipt match keys from the photo. purchaseDate must be an ISO calendar date YYYY-MM-DD with no time (example 2026-08-01). Convert printed dates such as 08/01/2026 or Aug 1, 2026 into YYYY-MM-DD. Do not invent unreadable fields — use null instead. printedTotalDollars is the grand total the customer paid, not subtotal, tax-only, or a line item.',
        user: 'Read vendor name, purchase date as YYYY-MM-DD, and printed grand total from this receipt image. Do not invent values.',
        images: [input.processedDataUrl],
    });
    return { header: parseHeaderCompletion(content), usage };
}

/**
 * Schema-constrained line items, tax, and discount. Printed total is locked when headers already read it.
 */
export async function readReceiptLines(input: ReceiptLinesVisionInput): Promise<ReceiptLinesVisionResult> {
    const expectedDollars =
        input.expectedPrintedMilliunits == null ? null : (input.expectedPrintedMilliunits / 1000).toFixed(2);
    const lockTotal =
        expectedDollars == null
            ? 'Read the printed grand total the customer paid. Do not invent a total that is not on the tape.'
            : `Printed grand total must stay ${expectedDollars} dollars. Do not change that total.`;
    const { content, usage } = await input.completeJson({
        apiKey: input.apiKey,
        baseUrl: input.baseUrl,
        model: input.model,
        timeoutMs: input.timeoutMs,
        schemaName: 'receipt_lines',
        schema: REPAIR_SCHEMA,
        system: 'Extract receipt line items from the photo. purchaseDate must be YYYY-MM-DD. Do not invent products or amounts. If you cannot make the math work, return the best readable lines without fabricating.',
        user: [lockTotal, 'Return purchaseDate as YYYY-MM-DD if readable.'].join('\n'),
        images: [input.processedDataUrl],
    });
    return { lines: parseLinesCompletion(content), usage };
}

export function parseHeaderCompletion(content: string): ReceiptHeaderVision {
    const record = parseObjectContent(content, 'receipt header');
    return {
        vendor: optionalText(record.vendor),
        purchaseDate: optionalIsoDate(record.purchaseDate),
        printedMilliunits: moneyToMilliunits(record.printedTotalDollars),
    };
}

export function parseLinesCompletion(content: string): ReceiptLinesVision {
    const record = parseObjectContent(content, 'receipt lines');
    const linesRaw = record.lines;
    const lines: ReceiptExtractLine[] = Array.isArray(linesRaw)
        ? linesRaw.map((entry) => parseRepairLine(entry)).filter((line): line is ReceiptExtractLine => line != null)
        : [];
    return {
        vendor: optionalText(record.vendor),
        purchaseDate: optionalIsoDate(record.purchaseDate),
        printedMilliunits: moneyToMilliunits(record.printedTotalDollars),
        taxMilliunits: moneyToMilliunits(record.taxDollars) ?? 0,
        discountMilliunits: Math.abs(moneyToMilliunits(record.discountDollars) ?? 0),
        lines,
    };
}

function parseRepairLine(entry: unknown): ReceiptExtractLine | null {
    if (!entry || typeof entry !== 'object') {
        return null;
    }
    const record = entry as Record<string, unknown>;
    const name = optionalText(record.name);
    if (!name) {
        return null;
    }
    return {
        name,
        amountMilliunits: moneyToMilliunits(record.amountDollars),
        quantity: optionalQuantity(record.quantity),
    };
}

function parseObjectContent(content: string, label: string): Record<string, unknown> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(content);
    } catch (error) {
        throw new LlmSuggestError(503, `OpenRouter ${label} was not valid JSON`, { cause: error });
    }
    if (Array.isArray(parsed)) {
        const only = parsed[0];
        if (parsed.length === 1 && only && typeof only === 'object' && !Array.isArray(only)) {
            parsed = only;
        } else {
            throw new LlmSuggestError(503, `OpenRouter ${label} was an array`);
        }
    }
    if (!parsed || typeof parsed !== 'object') {
        throw new LlmSuggestError(503, `OpenRouter ${label} was not an object`);
    }
    return parsed as Record<string, unknown>;
}

function optionalText(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalIsoDate(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    if (isIsoDate(trimmed)) {
        return trimmed;
    }
    const prefix = trimmed.slice(0, 10);
    return isIsoDate(prefix) ? prefix : null;
}

function optionalQuantity(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
