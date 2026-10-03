import type { ReceiptExtractLine } from './arithmeticGate';
import type { CompleteDecisions, NoulQuestion } from './decisionsClient';
import { completeDecisions } from './decisionsClient';

export const RECEIPT_BIND_CONFIRM_TIMEOUT_MS = 15000;

/** Line items beyond this add tokens without helping a same-purchase judgement. */
const MAX_STATE_LINES = 12;

export const BIND_CONFIRM_QUESTIONS: Readonly<Record<string, NoulQuestion>> = {
    same_purchase: {
        type: 'noul',
        instructions:
            'Are the paper receipt and the bank card charge records of the same real-world purchase, so the receipt should be attached to that charge?',
        criteria: {
            true: 'The bank charge is this receipt being paid: the merchant on the charge is the store on the receipt (allowing for bank abbreviations, processor prefixes and store numbers), and the amount and date are consistent with paying this receipt.',
            false: 'The charge is a different purchase, a different merchant, or an amount or date that this receipt does not explain.',
        },
    },
};

export type BindConfirmReceipt = {
    readonly vendor: string | null;
    readonly purchaseDate: string | null;
    readonly printedMilliunits: number | null;
    readonly taxMilliunits: number | null;
    readonly lines: readonly ReceiptExtractLine[];
};

export type BindConfirmTransaction = {
    readonly date: string;
    readonly amountMilliunits: number;
    readonly payeeName: string | null;
    readonly importPayeeNameOriginal: string | null;
    readonly accountName: string | null;
};

export type ConfirmReceiptBindInput = {
    readonly apiKey: string;
    readonly model: string;
    readonly receipt: BindConfirmReceipt;
    readonly transaction: BindConfirmTransaction;
    readonly timeoutMs?: number;
    readonly completeDecisionsImpl?: CompleteDecisions;
};

export type ReceiptBindConfirmation = {
    /** Probability the pair is the same purchase. `null` when Jev did not answer. */
    readonly samePurchase: number | null;
    readonly costUsd: number | null;
};

function dollars(milliunits: number | null): string {
    return (Math.abs(milliunits ?? 0) / 1000).toFixed(2);
}

/**
 * Raw facts only. Our similarity score, tier and confidence are deliberately
 * left out: the 2026-09-22 evaluation showed Jev reads a supplied verdict back
 * (agreement went from 12/20 to 20/20), which would make the check worthless.
 */
export function buildBindConfirmState(receipt: BindConfirmReceipt, transaction: BindConfirmTransaction): string {
    const lines = receipt.lines
        .slice(0, MAX_STATE_LINES)
        .map(
            (line) => `  - ${line.name}${line.amountMilliunits === null ? '' : `: $${dollars(line.amountMilliunits)}`}`,
        );
    if (receipt.lines.length > MAX_STATE_LINES) {
        lines.push(`  - … ${receipt.lines.length - MAX_STATE_LINES} more lines`);
    }
    const direction = transaction.amountMilliunits < 0 ? 'charge' : 'refund/credit';
    return [
        'A paper receipt was photographed and read by an AI vision model:',
        `  Store / vendor: ${receipt.vendor ?? '(unreadable)'}`,
        `  Purchase date: ${receipt.purchaseDate ?? '(unreadable)'}`,
        `  Printed total: $${dollars(receipt.printedMilliunits)}`,
        ...(receipt.taxMilliunits ? [`  Tax: $${dollars(receipt.taxMilliunits)}`] : []),
        '  Items:',
        ...(lines.length > 0 ? lines : ['  (none read)']),
        '',
        'A bank card transaction was imported from the bank:',
        `  Payee (as cleaned up in the budget): ${transaction.payeeName ?? '(none)'}`,
        `  Raw bank descriptor: ${transaction.importPayeeNameOriginal ?? '(none)'}`,
        `  Posted date: ${transaction.date}`,
        `  Amount: $${dollars(transaction.amountMilliunits)} ${direction}`,
        `  Account: ${transaction.accountName ?? '(unknown)'}`,
    ].join('\n');
}

/**
 * Final check before any automatic bind. Returns probabilities only; the
 * caller owns the threshold and must treat `null` as "not confirmed".
 */
export async function confirmReceiptBind(input: ConfirmReceiptBindInput): Promise<ReceiptBindConfirmation> {
    const decide = input.completeDecisionsImpl ?? completeDecisions;
    const result = await decide({
        apiKey: input.apiKey,
        model: input.model,
        state: buildBindConfirmState(input.receipt, input.transaction),
        questions: BIND_CONFIRM_QUESTIONS,
        timeoutMs: input.timeoutMs ?? RECEIPT_BIND_CONFIRM_TIMEOUT_MS,
    });
    return {
        samePurchase: result.nouls.same_purchase ?? null,
        costUsd: result.usage?.costUsd ?? null,
    };
}
