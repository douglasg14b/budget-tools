import { moneyToMilliunits } from '../../amazonOrders/moneyToMilliunits';
import type { OpenRouterUsage } from '../../categorization/llm/openRouterClient';
import type { CompleteOpenRouterJson } from './receiptHeaderVision';
import { parseObjectContent } from './receiptHeaderVision';

export const RECEIPT_SETTLE_TIMEOUT_MS = 60_000;

/*
 * Handwritten tips and totals, settled with the model reading and code doing the arithmetic.
 *
 * Evidence behind the shape (Riverside slip plus erased-handwriting variants):
 * - One read of the whole totals block lets arithmetic leak into reading: it saw the raised
 *   "66" of 17.66 only when the tip was present to justify it, and dropped a visible tip when the
 *   total was blank.
 * - A blind read of one row avoids the leak but misses raised cents, and attributes stray marks to
 *   the wrong row (the total's "66" read as a 4.00 tip once the real tip was erased).
 * - Self-consistency does NOT catch fabrication: a tip computed as total − subtotal came back
 *   identical 3/3. Only presence — marks actually on the row — does.
 *
 * Rules:
 * 1. A tip counts only when the block read AND the blind row read both see marks on the tip row.
 *    Otherwise it is 0. A tip is never derived.
 * 2. Arithmetic may resolve the sum (the grand total), never an addend. Fixing an addend lets any
 *    pair of inputs be made to fit, which is exactly how a fabricated tip appears.
 * 3. The total is resolved only between readings of marks that exist: the blind read and the
 *    arithmetic-implied value must share their dollars (17 vs 17.66), and the model must pick the
 *    implied value from a shuffled choice that includes a cents decoy — and must not pick that decoy
 *    when a counterfactual context claims it is the implied one. That control is what stops this
 *    step from simply agreeing with whatever it is told.
 */

type TotalsRole = 'subtotal' | 'tax' | 'discount' | 'tip' | 'total' | 'other';
type TotalsMedium = 'printed' | 'handwritten' | 'blank';

export type TotalsBlockRow = {
    readonly role: TotalsRole;
    readonly label: string;
    readonly writtenText: string;
    readonly medium: TotalsMedium;
};

export type FocusedRowRead = {
    readonly marksPresent: boolean;
    readonly writtenText: string | null;
    readonly milliunits: number | null;
};

type ChoiceKind = 'as-read' | 'implied' | 'decoy' | 'none';

export type TotalDisambiguation = {
    readonly asReadMilliunits: number;
    readonly impliedMilliunits: number;
    readonly decoyMilliunits: number;
    readonly choice: ChoiceKind;
    readonly counterfactualChoice: ChoiceKind;
    readonly observation: string | null;
    readonly accepted: boolean;
};

export type HandwrittenTotalsSettlement = {
    /** Amount the tip is added to: a printed pre-tip total, or subtotal + tax − discount. */
    readonly baseMilliunits: number | null;
    readonly tipMilliunits: number;
    /** Null when no grand total could be read; the caller keeps its own total. */
    readonly totalMilliunits: number | null;
    readonly totalSource: 'read' | 'reconciled' | null;
    /** base + tip === total. */
    readonly consistent: boolean;
    readonly blockRows: readonly TotalsBlockRow[];
    readonly tipRead: FocusedRowRead;
    readonly totalRead: FocusedRowRead;
    readonly disambiguation: TotalDisambiguation | null;
};

export type SettleHandwrittenTotalsInput = {
    readonly apiKey: string;
    readonly baseUrl: string;
    readonly model: string;
    readonly timeoutMs: number;
    readonly processedDataUrl: string;
    readonly completeJson: CompleteOpenRouterJson;
};

export type SettleHandwrittenTotalsResult = {
    readonly settlement: HandwrittenTotalsSettlement;
    readonly usage: readonly (OpenRouterUsage | null)[];
};

const BLOCK_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        rows: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    role: { type: 'string', enum: ['subtotal', 'tax', 'discount', 'tip', 'total', 'other'] },
                    label: { type: 'string' },
                    writtenText: { type: 'string' },
                    medium: { type: 'string', enum: ['printed', 'handwritten', 'blank'] },
                },
                required: ['role', 'label', 'writtenText', 'medium'],
            },
        },
    },
    required: ['rows'],
};

const ROW_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        marksPresent: { type: 'boolean' },
        writtenText: { type: ['string', 'null'] },
        amountDollars: { type: ['number', 'null'] },
    },
    required: ['marksPresent', 'writtenText', 'amountDollars'],
};

const CHOICE_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        observation: { type: 'string' },
        choice: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
    },
    required: ['observation', 'choice'],
};

const NO_ARITHMETIC = 'Do not do arithmetic and never work out one row from another — receipts do not always add up.';

const TIP_ROW = 'the tip (gratuity) row';
const TOTAL_ROW =
    'the grand total row — the final amount the customer paid (on a signed card slip, the handwritten total)';

/**
 * Reads the totals block three ways, then settles tip and grand total by the rules above.
 * Throws when a model call fails; the caller decides what an unsettled receipt keeps.
 */
export async function settleHandwrittenTotals(
    input: SettleHandwrittenTotalsInput,
): Promise<SettleHandwrittenTotalsResult> {
    // Settle every read before throwing, so a caller metering usage sees the calls that did answer.
    const [block, tipRead, totalRead] = await allOrFirstError([
        readTotalsBlock(input),
        readRow(input, TIP_ROW),
        readRow(input, TOTAL_ROW),
    ]);
    const usage: Usages = [...block.usage, ...tipRead.usage, ...totalRead.usage];
    const rows = block.rows;

    const blockTip = rows.find((row) => row.role === 'tip');
    const tipOnBlock =
        blockTip != null && blockTip.medium !== 'blank' && parseWrittenAmount(blockTip.writtenText) != null;
    const tipMilliunits = tipOnBlock && tipRead.read.marksPresent ? (tipRead.read.milliunits ?? 0) : 0;
    const baseMilliunits = baseBeforeTip(rows);

    const settlement = {
        baseMilliunits,
        tipMilliunits,
        blockRows: rows,
        tipRead: tipRead.read,
        totalRead: totalRead.read,
    };
    const asRead = totalRead.read.marksPresent ? totalRead.read.milliunits : null;
    if (asRead == null || baseMilliunits == null) {
        return {
            settlement: {
                ...settlement,
                totalMilliunits: asRead,
                totalSource: asRead == null ? null : 'read',
                consistent: false,
                disambiguation: null,
            },
            usage,
        };
    }

    const implied = baseMilliunits + tipMilliunits;
    if (implied === asRead) {
        return {
            settlement: {
                ...settlement,
                totalMilliunits: asRead,
                totalSource: 'read',
                consistent: true,
                disambiguation: null,
            },
            usage,
        };
    }
    if (wholeDollars(implied) !== wholeDollars(asRead)) {
        return {
            settlement: {
                ...settlement,
                totalMilliunits: asRead,
                totalSource: 'read',
                consistent: false,
                disambiguation: null,
            },
            usage,
        };
    }

    const disambiguation = await disambiguateTotal(input, asRead, implied);
    usage.push(...disambiguation.usage);
    const accepted = disambiguation.result.accepted;
    return {
        settlement: {
            ...settlement,
            totalMilliunits: accepted ? implied : asRead,
            totalSource: accepted ? 'reconciled' : 'read',
            consistent: accepted,
            disambiguation: disambiguation.result,
        },
        usage,
    };
}

/**
 * Parses an amount as a person or printer wrote it: "USD 12.66", "$5.00", "17", and "17 66"
 * (raised cents transcribed after a space). Returns milliunits, or null when it is not an amount.
 */
export function parseWrittenAmount(text: string | null): number | null {
    if (!text) {
        return null;
    }
    const cleaned = text
        .replace(/[^0-9., ]/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
    const withoutThousands = cleaned.includes('.') ? cleaned.replace(/,/g, '') : cleaned;
    const match =
        /^(\d+)[.,](\d{2})$/.exec(withoutThousands) ??
        /^(\d+) (\d{2})$/.exec(withoutThousands) ??
        /^(\d+)[.,](\d)$/.exec(withoutThousands) ??
        /^(\d+)$/.exec(withoutThousands);
    if (!match) {
        return null;
    }
    const dollars = Number(match[1]);
    const cents = match[2] == null ? 0 : Number(match[2].padEnd(2, '0'));
    return dollars * 1000 + cents * 10;
}

/** Printed pre-tip total when the slip has one beside a handwritten total; otherwise subtotal + tax − discount. */
function baseBeforeTip(rows: readonly TotalsBlockRow[]): number | null {
    const printedTotals = rows.filter((row) => row.role === 'total' && row.medium === 'printed');
    const handwrittenTotal = rows.some((row) => row.role === 'total' && row.medium === 'handwritten');
    const preTipTotal = handwrittenTotal ? printedTotals.at(-1) : undefined;
    if (preTipTotal) {
        return parseWrittenAmount(preTipTotal.writtenText);
    }
    const subtotal = rows.find((row) => row.role === 'subtotal' && row.medium === 'printed');
    const subtotalMilliunits = parseWrittenAmount(subtotal?.writtenText ?? null);
    if (subtotalMilliunits == null) {
        return null;
    }
    return subtotalMilliunits + printedSum(rows, 'tax') - printedSum(rows, 'discount');
}

function printedSum(rows: readonly TotalsBlockRow[], role: TotalsRole): number {
    return rows
        .filter((row) => row.role === role && row.medium === 'printed')
        .reduce((sum, row) => sum + Math.abs(parseWrittenAmount(row.writtenText) ?? 0), 0);
}

function wholeDollars(milliunits: number): number {
    return Math.trunc(milliunits / 1000);
}

type Usages = (OpenRouterUsage | null)[];

/**
 * One schema-constrained vision call, parsed to an object. A malformed reply (e.g. a multi-element
 * array), or one that fails `wellFormed`, is asked again once — the same question, not a different
 * one, so a retry cannot steer the answer. A second ill-formed reply is returned as-is; callers
 * treat what it lacks as "not seen", which stores no tip.
 */
async function completeRecord(
    input: SettleHandwrittenTotalsInput,
    request: { schemaName: string; schema: Record<string, unknown>; system: string; user: string },
    label: string,
    wellFormed: (record: Record<string, unknown>) => boolean = () => true,
): Promise<{ record: Record<string, unknown>; usage: Usages }> {
    const usage: Usages = [];
    for (let attempt = 0; ; attempt++) {
        const result = await input.completeJson({
            apiKey: input.apiKey,
            baseUrl: input.baseUrl,
            model: input.model,
            timeoutMs: input.timeoutMs,
            images: [input.processedDataUrl],
            ...request,
        });
        usage.push(result.usage);
        const lastAttempt = attempt >= 1;
        let record: Record<string, unknown>;
        try {
            record = parseObjectContent(result.content, label);
        } catch (error) {
            if (lastAttempt) {
                throw error;
            }
            continue;
        }
        if (lastAttempt || wellFormed(record)) {
            return { record, usage };
        }
    }
}

/** Like Promise.all, but waits for every promise before rethrowing the first failure. */
async function allOrFirstError<T extends readonly unknown[] | []>(
    promises: T,
): Promise<{ -readonly [K in keyof T]: Awaited<T[K]> }> {
    const results = await Promise.allSettled(promises as Iterable<unknown>);
    for (const result of results) {
        if (result.status === 'rejected') {
            throw result.reason;
        }
    }
    return results.map((result) => (result as PromiseFulfilledResult<unknown>).value) as {
        -readonly [K in keyof T]: Awaited<T[K]>;
    };
}

/** A totals block with no subtotal, tip, or total row is a failed read, not a receipt without them. */
function hasTotalsRoles(record: Record<string, unknown>): boolean {
    return (
        Array.isArray(record.rows) &&
        record.rows.some((row) => ['subtotal', 'tip', 'total'].includes(parseBlockRow(row)?.role ?? 'other'))
    );
}

async function readTotalsBlock(
    input: SettleHandwrittenTotalsInput,
): Promise<{ rows: TotalsBlockRow[]; usage: Usages }> {
    const { record, usage } = await completeRecord(
        input,
        {
            schemaName: 'receipt_totals_block',
            schema: BLOCK_SCHEMA,
            system: `Transcribe the money rows of this receipt's totals block (subtotal, tax, discount, tip, total) exactly as written. ${NO_ARITHMETIC} Mark each row printed or handwritten; use medium "blank" with empty writtenText when a row has nothing written on it.`,
            user: 'Transcribe every totals-block row: role, label, amount as written, and printed/handwritten/blank.',
        },
        'receipt totals block',
        hasTotalsRoles,
    );
    const rows = Array.isArray(record.rows) ? record.rows.map(parseBlockRow).filter((row) => row != null) : [];
    return { rows, usage };
}

async function readRow(
    input: SettleHandwrittenTotalsInput,
    row: string,
): Promise<{ read: FocusedRowRead; usage: Usages }> {
    const { record, usage } = await completeRecord(
        input,
        {
            schemaName: 'receipt_row_read',
            schema: ROW_SCHEMA,
            system: `You read one row of a receipt: ${row}. Look only at that row and the space where its amount is written. Ignore every other row. ${NO_ARITHMETIC} If nothing is written for this row, set marksPresent false and writtenText and amountDollars null. Otherwise transcribe exactly what is written, including small or raised digits after the dollars, and give amountDollars as a decimal number (raised cents are the decimal part: 23 with a raised 40 is 23.40).`,
            user: `What amount, if any, is written on ${row}?`,
        },
        'receipt row read',
    );
    const writtenText = typeof record.writtenText === 'string' ? record.writtenText : null;
    // amountDollars carries the model's own placement of the decimal point; a bare transcription
    // like "1700" for a 17 with raised 00 is ambiguous on its own.
    const milliunits = moneyToMilliunits(record.amountDollars) ?? parseWrittenAmount(writtenText);
    return {
        read: { marksPresent: record.marksPresent === true && milliunits != null, writtenText, milliunits },
        usage,
    };
}

async function disambiguateTotal(
    input: SettleHandwrittenTotalsInput,
    asRead: number,
    implied: number,
): Promise<{ result: TotalDisambiguation; usage: Usages }> {
    const decoy = decoyFor(asRead, implied);
    // Different positions in the two runs, with the counterfactual's "implied" option first, so a
    // positional bias cannot pass the control.
    const trueRun = await askTotalChoice(input, implied, [
        ['as-read', asRead],
        ['implied', implied],
        ['decoy', decoy],
    ]);
    const counterfactual = await askTotalChoice(input, decoy, [
        ['decoy', decoy],
        ['as-read', asRead],
        ['implied', implied],
    ]);
    return {
        result: {
            asReadMilliunits: asRead,
            impliedMilliunits: implied,
            decoyMilliunits: decoy,
            choice: trueRun.choice,
            counterfactualChoice: counterfactual.choice,
            observation: trueRun.observation,
            accepted: trueRun.choice === 'implied' && counterfactual.choice !== 'decoy',
        },
        usage: [...trueRun.usage, ...counterfactual.usage],
    };
}

/** Same dollars as the implied total, cents far from both it and the as-read value. */
function decoyFor(asRead: number, implied: number): number {
    const impliedCents = Math.round((implied % 1000) / 10);
    const asReadCents = Math.round((asRead % 1000) / 10);
    let decoyCents = (impliedCents + 50) % 100;
    if (decoyCents === asReadCents) {
        decoyCents = (impliedCents + 25) % 100;
    }
    return wholeDollars(implied) * 1000 + decoyCents * 10;
}

async function askTotalChoice(
    input: SettleHandwrittenTotalsInput,
    claimedImplied: number,
    options: readonly (readonly [ChoiceKind, number])[],
): Promise<{ choice: ChoiceKind; observation: string | null; usage: Usages }> {
    const letters = ['A', 'B', 'C'] as const;
    const listed = options.map(([, amount], index) => `${letters[index]}) ${dollars(amount)}`).join('\n');
    const { record, usage } = await completeRecord(
        input,
        {
            schemaName: 'receipt_total_choice',
            schema: CHOICE_SCHEMA,
            system: `You check one handwritten amount on a receipt: ${TOTAL_ROW}. Handwritten cents are often small raised digits after the dollars and can be hard to read. If this receipt adds up, that total would be ${dollars(claimedImplied)} — but receipts do not always add up, so choose what is actually written, not what the arithmetic suggests. First describe the marks you see on that row, then choose.`,
            user: `Which amount is written on that row?\n${listed}\nD) none of these`,
        },
        'receipt total choice',
    );
    const index = letters.indexOf(record.choice as (typeof letters)[number]);
    const picked = index === -1 ? undefined : options[index];
    return {
        choice: picked ? picked[0] : 'none',
        observation: typeof record.observation === 'string' ? record.observation : null,
        usage,
    };
}

function parseBlockRow(entry: unknown): TotalsBlockRow | null {
    if (!entry || typeof entry !== 'object') {
        return null;
    }
    const record = entry as Record<string, unknown>;
    const roles: readonly TotalsRole[] = ['subtotal', 'tax', 'discount', 'tip', 'total', 'other'];
    const media: readonly TotalsMedium[] = ['printed', 'handwritten', 'blank'];
    return {
        role: roles.includes(record.role as TotalsRole) ? (record.role as TotalsRole) : 'other',
        label: typeof record.label === 'string' ? record.label : '',
        writtenText: typeof record.writtenText === 'string' ? record.writtenText : '',
        medium: media.includes(record.medium as TotalsMedium) ? (record.medium as TotalsMedium) : 'blank',
    };
}

function dollars(milliunits: number): string {
    return `$${(milliunits / 1000).toFixed(2)}`;
}
