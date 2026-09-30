import type { ReceiptExtractLine } from './arithmeticGate';
import type { CompleteDecisions, NoulQuestion } from './decisionsClient';
import { completeDecisions } from './decisionsClient';

export const RECEIPT_VERIFY_TIMEOUT_MS = 15000;

/**
 * Thresholds from the evaluation in `.spike/jev_eval` (2026-09-22), measured on 84
 * labelled cases built by injecting known defects into receipts that pass the
 * arithmetic gate:
 *   discount double-counted  14/14 detected, 1/70 false positives
 *   vendor truncated         12/14 detected, 1/70 false positives
 * Both were stable across runs. Sample is small, so these are deliberately a
 * single named constant rather than scattered literals.
 */
export const RECEIPT_VERIFY_THRESHOLD = 0.6;

export type ReceiptVerifyFlag = 'vendor-suspect' | 'discount-double-counted';

export type ReceiptVerifyResult = {
    readonly flags: readonly ReceiptVerifyFlag[];
    /** Raw probabilities, kept so a reviewer can see how close a call was. */
    readonly scores: Readonly<Record<string, number>>;
    readonly costUsd: number | null;
};

const QUESTIONS: Readonly<Record<string, NoulQuestion>> = {
    vendor_looks_truncated: {
        type: 'noul',
        instructions:
            'Does the parsed vendor name look truncated, misspelled, or like a fragment of the real merchant name rather than the merchant name itself?',
        criteria: {
            true: 'The vendor string looks cut off, garbled, or is a near-miss of a well known retailer name.',
            false: 'The vendor is a plausible, complete merchant name.',
        },
    },
    discount_double_counted: {
        type: 'noul',
        instructions:
            'Has a discount, coupon or savings amount been counted twice -- once inside the line items and again in the separate discount field?',
        criteria: {
            true: 'A line item represents a discount, coupon, savings or price reduction AND a separate non-zero discount amount is also recorded.',
            false: 'No discount is double counted. Either no line item is a discount, or the separate discount field is zero.',
        },
    },
};

export type VerifyReceiptExtractInput = {
    readonly apiKey: string;
    readonly model: string;
    readonly vendor: string | null;
    readonly printedMilliunits: number | null;
    readonly lines: readonly ReceiptExtractLine[];
    readonly taxMilliunits: number;
    readonly discountMilliunits: number;
    readonly timeoutMs?: number;
    readonly completeDecisionsImpl?: CompleteDecisions;
};

function dollars(milliunits: number | null): string {
    return ((milliunits ?? 0) / 1000).toFixed(2);
}

/**
 * State deliberately omits any arithmetic verdict. Handing the model the gate
 * result inflated agreement from 12/20 to 20/20 in evaluation because it simply
 * read the answer back. The value here is structural judgement, not arithmetic.
 */
export function buildVerifyState(input: VerifyReceiptExtractInput): string {
    const lines = input.lines.map((line) => `  - ${line.name}: $${dollars(line.amountMilliunits)}`).join('\n');
    return [
        'A receipt was photographed and an AI vision model extracted the following.',
        '',
        `Vendor as parsed: ${input.vendor ?? '(none)'}`,
        `Printed grand total as parsed: $${dollars(input.printedMilliunits)}`,
        '',
        'Line items as parsed:',
        lines || '  (none)',
        '',
        `Tax recorded separately: $${dollars(input.taxMilliunits)}`,
        `Discount recorded separately: $${dollars(input.discountMilliunits)}`,
    ].join('\n');
}

/**
 * Second-opinion pass over a finished extract. Flags only: it never changes the
 * extract, never gates it, and never decides whether the arithmetic is correct —
 * `arithmeticGate` owns that and is exact.
 */
export async function verifyReceiptExtract(input: VerifyReceiptExtractInput): Promise<ReceiptVerifyResult> {
    const decide = input.completeDecisionsImpl ?? completeDecisions;
    const result = await decide({
        apiKey: input.apiKey,
        model: input.model,
        state: buildVerifyState(input),
        questions: QUESTIONS,
        timeoutMs: input.timeoutMs ?? RECEIPT_VERIFY_TIMEOUT_MS,
    });

    const flags: ReceiptVerifyFlag[] = [];
    const vendorScore = result.nouls.vendor_looks_truncated;
    const discountScore = result.nouls.discount_double_counted;
    if (input.vendor && vendorScore != null && vendorScore >= RECEIPT_VERIFY_THRESHOLD) {
        flags.push('vendor-suspect');
    }
    if (discountScore != null && discountScore >= RECEIPT_VERIFY_THRESHOLD) {
        flags.push('discount-double-counted');
    }
    return { flags, scores: result.nouls, costUsd: result.usage?.costUsd ?? null };
}
