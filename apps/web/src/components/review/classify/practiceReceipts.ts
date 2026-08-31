import type { ExtractPreviewResultDto, MatchPreviewReceiptDto, ReceiptExtractStatus } from '@budget-tools/web-sdk';

export type PracticeReceipt = {
    readonly id: string;
    readonly transactionId: string | null;
    readonly frames: readonly string[];
    readonly vendor: string | null;
    readonly purchaseDate: string | null;
    readonly printedMilliunits: number | null;
    readonly totalsDisagree: boolean;
    readonly extractStatus: ReceiptExtractStatus | null;
    readonly extractJson: string | null;
    readonly rawText: string | null;
};

/**
 * Builds a session-only receipt from extract-preview. Amazon drops are not stored.
 */
export function practiceReceiptFromExtract(
    id: string,
    transactionId: string | null,
    frames: readonly string[],
    extract: ExtractPreviewResultDto,
): PracticeReceipt | null {
    if (extract.droppedAsAmazon) {
        return null;
    }
    return {
        id,
        transactionId,
        frames,
        vendor: extract.vendor,
        purchaseDate: extract.purchaseDate,
        printedMilliunits: extract.printedMilliunits,
        totalsDisagree: extract.totalsDisagree,
        extractStatus: extract.extractStatus,
        extractJson: extract.extractJson,
        rawText: extract.rawText,
    };
}

export function toMatchPreviewReceipt(receipt: PracticeReceipt): MatchPreviewReceiptDto {
    return {
        id: receipt.id,
        vendor: receipt.vendor,
        purchaseDate: receipt.purchaseDate,
        printedMilliunits: receipt.printedMilliunits,
        totalsDisagree: receipt.totalsDisagree,
    };
}
