import type { ReceiptExtractStatus } from './data/receiptsSchema';
import type { ClosePairMatch } from './matchReceipts';

export type ReceiptDto = {
    id: string;
    createdAt: string;
    vendor: string | null;
    purchaseDate: string | null;
    printedMilliunits: number | null;
    extractStatus: ReceiptExtractStatus;
    extractJson: string | null;
    rawText: string | null;
    transactionId: string | null;
    contentHash: string;
    totalsDisagree: boolean;
    frameCount: number;
};

export type ReceiptsDto = {
    receipts: ReceiptDto[];
};

export type CreateReceiptDto = {
    frames: string[];
    transactionId?: string;
};

export type BindReceiptDto = {
    transactionId: string;
};

export type ReceiptMatchCloseDto = ClosePairMatch;

export type ReceiptMatchDto = {
    amazonSkipped: boolean;
    autoBind: boolean;
    exactReceiptId: string | null;
    exactTransactionId: string | null;
    closeMatches: ReceiptMatchCloseDto[];
};

export type MatchPreviewReceiptDto = {
    id: string;
    vendor: string | null;
    purchaseDate: string | null;
    printedMilliunits: number | null;
    totalsDisagree: boolean;
};

export type MatchPreviewTransactionDto = {
    id: string;
    date: string;
    amount: number;
    payeeName: string | null;
    importPayeeName: string | null;
    importPayeeNameOriginal: string | null;
};

export type MatchPreviewDto = {
    receipts: MatchPreviewReceiptDto[];
    transactionId?: string;
    transaction?: MatchPreviewTransactionDto;
};
