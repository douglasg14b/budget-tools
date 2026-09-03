import type { CreateReceiptDto, ExtractPreviewDto } from '@budget-tools/web-sdk';

/** Matches the API default RECEIPTS_JSON_BODY_LIMIT (15 * 1024 * 1024). */
export const RECEIPTS_JSON_BODY_LIMIT_DEFAULT_BYTES = 15 * 1024 * 1024;

export const RECEIPT_BODY_TOO_LARGE_MESSAGE =
    'That photo is too large to send with its cropped copy. Try a smaller file.';

export type ReceiptAttachImages = {
    readonly original: string;
    readonly processed: string;
};

export type CreateReceiptAttachImages = ReceiptAttachImages & {
    readonly transactionId: string | null;
};

/**
 * Live create body: original in frames[], Scanic JPEG in processed.
 */
export function buildCreateReceiptBody(input: CreateReceiptAttachImages): CreateReceiptDto {
    return {
        frames: [input.original],
        processed: input.processed,
        ...(input.transactionId ? { transactionId: input.transactionId } : {}),
    };
}

/**
 * Practice extract-preview body: originals in frames[], Scanic JPEG as vision input.
 */
export function buildExtractPreviewBody(input: ReceiptAttachImages): ExtractPreviewDto {
    return {
        frames: [input.original],
        processed: input.processed,
    };
}

/**
 * Refuse before POST when the JSON body would exceed the API default 15 MiB cap.
 */
export function assertReceiptJsonBodyWithinLimit(body: unknown): void {
    const encoded = JSON.stringify(body);
    const byteLength = new TextEncoder().encode(encoded).byteLength;
    if (byteLength > RECEIPTS_JSON_BODY_LIMIT_DEFAULT_BYTES) {
        throw new Error(RECEIPT_BODY_TOO_LARGE_MESSAGE);
    }
}

export function liveReceiptImageSrc(input: { readonly id: string; readonly hasProcessed: boolean }): string {
    return input.hasProcessed ? `/api/receipts/${input.id}/image?variant=processed` : `/api/receipts/${input.id}/image`;
}

export function practiceReceiptImageSrc(input: {
    readonly processedPreview: string | null;
    readonly frames: readonly string[];
}): string | null {
    return input.processedPreview ?? input.frames[0] ?? null;
}
