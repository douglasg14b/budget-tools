import type { ReceiptExtractStatus } from './data/receiptsSchema';

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
