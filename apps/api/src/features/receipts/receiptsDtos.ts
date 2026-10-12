import type { ReceiptBindCheckOutcome, ReceiptBindSource, ReceiptExtractStatus } from './data/receiptsSchema';
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
    extractCostUsd: number | null;
    transactionId: string | null;
    contentHash: string;
    totalsDisagree: boolean;
    frameCount: number;
    hasProcessed: boolean;
    /** How the current binding was made; null when unbound. */
    bindSource: ReceiptBindSource | null;
    boundAt: string | null;
    /** Jev same-purchase probability behind an `auto` bind. */
    bindJevScore: number | null;
    /** Last background auto-bind attempt and what it concluded. */
    bindCheckedAt: string | null;
    bindCheckOutcome: ReceiptBindCheckOutcome | null;
};

export type ReceiptsDto = {
    receipts: ReceiptDto[];
};

export type CreateReceiptDto = {
    frames: string[];
    processed?: string;
    transactionId?: string;
};

export type BindReceiptDto = {
    transactionId: string;
};

export type PatchReceiptLineDto = {
    name: string;
    amountMilliunits?: number | null;
    quantity?: number | null;
};

export type PatchReceiptDto = {
    vendor: string | null;
    purchaseDate: string | null;
    printedMilliunits: number | null;
    taxMilliunits: number;
    discountMilliunits: number;
    /** Omit to keep the previously extracted tip. */
    tipMilliunits?: number;
    lines: PatchReceiptLineDto[];
    /** Omit to keep the extracted reimbursable mark; null clears it. */
    reimbursable?: PatchReceiptReimbursableDto | null;
};

export type PatchReceiptReimbursableDto = {
    /** The reimbursable share, positive; null when only the mark is known. */
    amountMilliunits: number | null;
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
    /** Pre-picked category (the reimbursable share); absent when the reviewer picks. */
    category?: ReceiptSplitDraftCategoryDto;
};

export type ReceiptSplitDraftCategoryDto = {
    id: string;
    name: string;
    groupName: string;
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
    processed?: string;
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
