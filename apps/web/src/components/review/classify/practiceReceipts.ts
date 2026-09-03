import type { ExtractPreviewResultDto, MatchPreviewReceiptDto, ReceiptExtractStatus } from '@budget-tools/web-sdk';

export type PracticeReceipt = {
    readonly id: string;
    readonly transactionId: string | null;
    readonly frames: readonly string[];
    readonly processedPreview: string | null;
    readonly vendor: string | null;
    readonly purchaseDate: string | null;
    readonly printedMilliunits: number | null;
    readonly totalsDisagree: boolean;
    readonly extractStatus: ReceiptExtractStatus | null;
    readonly extractJson: string | null;
    readonly rawText: string | null;
};

export type PracticeReceiptFromExtractInput = {
    readonly id: string;
    readonly transactionId: string | null;
    readonly frames: readonly string[];
    readonly processedPreview: string | null;
    readonly extract: ExtractPreviewResultDto;
};

/**
 * Builds a session-only receipt from extract-preview. Amazon drops are not stored.
 */
export function practiceReceiptFromExtract(input: PracticeReceiptFromExtractInput): PracticeReceipt | null {
    if (input.extract.droppedAsAmazon) {
        return null;
    }
    return {
        id: input.id,
        transactionId: input.transactionId,
        frames: input.frames,
        processedPreview: input.processedPreview,
        vendor: input.extract.vendor,
        purchaseDate: input.extract.purchaseDate,
        printedMilliunits: input.extract.printedMilliunits,
        totalsDisagree: input.extract.totalsDisagree,
        extractStatus: input.extract.extractStatus,
        extractJson: input.extract.extractJson,
        rawText: input.extract.rawText,
    };
}

export function toMatchPreviewReceipt(receipt: PracticeReceipt): MatchPreviewReceiptDto {
    return {
        id: receipt.id,
        vendor: receipt.vendor,
        purchaseDate: receipt.purchaseDate,
        printedMilliunits: receipt.printedMilliunits,
        totalsDisagree: receipt.totalsDisagree,
        extractStatus: receipt.extractStatus,
        extractJson: receipt.extractJson,
    };
}

export function bindPracticeReceipt(
    receipts: readonly PracticeReceipt[],
    receiptId: string,
    transactionId: string | null,
): PracticeReceipt[] {
    return receipts.map((receipt) => (receipt.id === receiptId ? { ...receipt, transactionId } : receipt));
}
