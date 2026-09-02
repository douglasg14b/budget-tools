import { HttpError } from '../travelWindows/HttpError';
import { decodeDataUrlFrame } from './createReceipt';
import type { ExtractFramesFn, ReceiptExtractComplete } from './extractReceipt';
import { extractReceipt } from './extractReceipt';
import { assertReceiptFrameCountWithinLimit } from './receiptLimits';
import type { ExtractPreviewDto, ExtractPreviewResultDto } from './receiptsDtos';

/**
 * Practice / ephemeral extract: same pipeline as Live, writes no files or SQLite rows.
 */
export async function extractPreview(
    body: ExtractPreviewDto,
    extract: ExtractFramesFn = extractReceipt,
): Promise<ExtractPreviewResultDto> {
    if (body.frames.length === 0) {
        throw new HttpError(400, 'Receipt extract-preview requires at least one frame');
    }
    assertReceiptFrameCountWithinLimit(body.frames.length);
    // Vision input is the client-prepared JPEG; frames stay originals for the request body.
    const frames = body.processed ? [decodeDataUrlFrame(body.processed)] : body.frames.map(decodeDataUrlFrame);
    const result = await extract({ frames });
    if (result.kind === 'amazon') {
        return amazonPreviewResult();
    }
    return completePreviewResult(result);
}

function completePreviewResult(result: ReceiptExtractComplete): ExtractPreviewResultDto {
    return {
        droppedAsAmazon: false,
        extractStatus: result.extractStatus,
        vendor: result.vendor,
        purchaseDate: result.purchaseDate,
        printedMilliunits: result.printedMilliunits,
        totalsDisagree: result.totalsDisagree,
        extractJson: result.extractJson,
        rawText: result.rawText,
    };
}

function amazonPreviewResult(): ExtractPreviewResultDto {
    return {
        droppedAsAmazon: true,
        extractStatus: null,
        vendor: null,
        purchaseDate: null,
        printedMilliunits: null,
        totalsDisagree: false,
        extractJson: null,
        rawText: null,
    };
}
