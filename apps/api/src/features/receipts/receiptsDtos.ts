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

export type ReceiptBindCandidateDto = {
    id: string;
    date: string;
    amount: number;
    payeeName: string | null;
    importPayeeName: string | null;
    importPayeeNameOriginal: string | null;
    accountName: string;
    categoryName: string | null;
    memo: string | null;
};

export type ReceiptSplitDraftLineDto = {
    amountMilliunits: number;
    memo: string | null;
};

export type ReceiptSplitDraftDto = {
    kind: 'single' | 'split';
    lines: ReceiptSplitDraftLineDto[];
};

export type ReceiptMatchDto = {
    amazonSkipped: boolean;
    autoBind: boolean;
    exactReceiptId: string | null;
    exactTransactionId: string | null;
    closeMatches: ReceiptMatchCloseDto[];
    bindCandidates: ReceiptBindCandidateDto[];
    splitDraft: ReceiptSplitDraftDto | null;
};

export type ExtractPreviewDto = {
    frames: string[];
};

export type ExtractPreviewResultDto = {
    droppedAsAmazon: boolean;
    extractStatus: ReceiptExtractStatus | null;
    vendor: string | null;
    purchaseDate: string | null;
    printedMilliunits: number | null;
    totalsDisagree: boolean;
    extractJson: string | null;
    rawText: string | null;
};

export type MatchPreviewReceiptDto = {
    id: string;
    vendor: string | null;
    purchaseDate: string | null;
    printedMilliunits: number | null;
    totalsDisagree: boolean;
    extractStatus?: ReceiptExtractStatus | null;
    extractJson?: string | null;
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
