import { moneyToMilliunits } from '../../amazonOrders/moneyToMilliunits';
import type { OpenRouterUsage } from '../../categorization/llm/openRouterClient';
import type { CompleteOpenRouterJson } from './receiptHeaderVision';
import { parseObjectContent, REIMBURSABLE_WORD } from './receiptHeaderVision';

export const RECEIPT_REIMBURSABLE_TIMEOUT_MS = 60_000;

/**
 * A note written on a receipt marking it reimbursable, e.g. "Reimbursable: $54.61". The amount is
 * only what is written beside the word; null when the note carries none.
 */
export type ReceiptReimbursableNote = {
    readonly writtenText: string | null;
    readonly amountMilliunits: number | null;
};

export type ReadReimbursableNoteInput = {
    readonly apiKey: string;
    readonly baseUrl: string;
    readonly model: string;
    readonly timeoutMs: number;
    readonly processedDataUrl: string;
    readonly completeJson: CompleteOpenRouterJson;
};

export type ReadReimbursableNoteResult = {
    /** Null when the read finds no reimbursable note after all. */
    readonly note: ReceiptReimbursableNote | null;
    readonly usage: OpenRouterUsage | null;
};

const NOTE_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        notePresent: { type: 'boolean' },
        writtenText: { type: ['string', 'null'] },
        amountDollars: { type: ['number', 'null'] },
    },
    required: ['notePresent', 'writtenText', 'amountDollars'],
};

/**
 * Transcribes the reimbursable note and the amount written for it. The amount is read, never
 * computed: a handwritten total next to it is a different row.
 */
export async function readReimbursableNote(input: ReadReimbursableNoteInput): Promise<ReadReimbursableNoteResult> {
    const { content, usage } = await input.completeJson({
        purpose: 'receipt-reimbursable-note',
        apiKey: input.apiKey,
        baseUrl: input.baseUrl,
        model: input.model,
        timeoutMs: input.timeoutMs,
        schemaName: 'receipt_reimbursable_note',
        schema: NOTE_SCHEMA,
        system: `You read one note on a receipt: ${REIMBURSABLE_WORD}. notePresent is false when no such word is written. writtenText is the note exactly as written, word and amount. amountDollars is the amount written beside or under that word, as a decimal number; null when the note has no amount. Other notes such as a handwritten "Total" are different rows: never report their amount. Do not do arithmetic and never work out the amount from other numbers on the receipt.`,
        user: 'Is a reimbursable note written on this receipt? Transcribe it and the amount written for it.',
        images: [input.processedDataUrl],
    });
    return { note: parseReimbursableNoteCompletion(content), usage };
}

export function parseReimbursableNoteCompletion(content: string): ReceiptReimbursableNote | null {
    const record = parseObjectContent(content, 'receipt reimbursable note');
    if (record.notePresent !== true) {
        return null;
    }
    const writtenText =
        typeof record.writtenText === 'string' && record.writtenText.trim() ? record.writtenText.trim() : null;
    const amount = moneyToMilliunits(record.amountDollars);
    return { writtenText, amountMilliunits: amount != null && amount > 0 ? amount : null };
}
