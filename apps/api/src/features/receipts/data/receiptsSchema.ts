export type ReceiptExtractStatus = 'pending' | 'gated' | 'ungated' | 'failed';

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
};
