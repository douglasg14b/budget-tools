export type ReceiptExtractStatus = 'pending' | 'gated' | 'ungated' | 'failed';

/** `capture` = photographed from a transaction card; `auto` = the binder, confirmed by Jev. */
export type ReceiptBindSource = 'capture' | 'manual' | 'auto';

/** Why the last auto-bind attempt left a receipt unbound (or `bound`). */
export type ReceiptBindCheckOutcome =
    | 'bound'
    | 'no-candidate'
    | 'not-confirmed'
    | 'ambiguous'
    | 'jev-unavailable'
    | 'lost-race';

export type ReceiptsTable = {
    id: string;
    createdAt: string;
    vendor: string | null;
    purchaseDate: string | null;
    printedMilliunits: number | null;
    extractStatus: ReceiptExtractStatus;
    extractJson: string | null;
    rawText: string | null;
    originalPath: string;
    transactionId: string | null;
    contentHash: string;
    perceptualHash: string | null;
    totalsDisagree: boolean;
    extractCostUsd: number | null;
    extractPromptTokens: number | null;
    extractCompletionTokens: number | null;
    bindSource: ReceiptBindSource | null;
    boundAt: string | null;
    bindJevScore: number | null;
    bindCheckedAt: string | null;
    bindCheckOutcome: ReceiptBindCheckOutcome | null;
};

export type ReceiptBindRejectionsTable = {
    receiptId: string;
    transactionId: string;
    createdAt: string;
};
