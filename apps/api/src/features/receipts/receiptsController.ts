import type { Request as ExpressRequest } from 'express';
import {
    Body,
    Delete,
    Get,
    Patch,
    Path,
    Post,
    Produces,
    Query,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from 'tsoa';

import { HttpError } from '../travelWindows/HttpError';
import { createReceipt } from './createReceipt';
import type { ReceiptRow } from './data/receiptsRepo';
import {
    countReceiptFrames,
    deleteReceipt as deleteReceiptRow,
    hasReceiptProcessed,
    listReceipts as listReceiptRows,
    readReceiptImageBytes,
    requireReceipt,
    setReceiptTransactionId,
} from './data/receiptsRepo';
import { extractPreview as previewReceiptExtract } from './extractPreview';
import { kickReceiptExtractIfPending } from './extractStoredReceipt';
import {
    lookupByReceipt as lookupReceiptRow,
    lookupByTransaction as lookupTransactionRow,
    matchPreview as previewReceiptMatch,
    toReceiptMatchDto,
} from './lookupReceiptMatch';
import { patchReceipt as patchReceiptRow } from './patchReceipt';
import type {
    BindReceiptDto,
    CreateReceiptDto,
    ExtractPreviewDto,
    ExtractPreviewResultDto,
    MatchPreviewDto,
    PatchReceiptDto,
    ReceiptDto,
    ReceiptMatchDto,
    ReceiptsDto,
} from './receiptsDtos';

async function toReceiptDto(row: ReceiptRow): Promise<ReceiptDto> {
    return {
        id: row.id,
        createdAt: row.createdAt,
        vendor: row.vendor,
        purchaseDate: row.purchaseDate,
        printedMilliunits: row.printedMilliunits,
        extractStatus: row.extractStatus,
        extractJson: row.extractJson,
        rawText: row.rawText,
        extractCostUsd: row.extractCostUsd,
        transactionId: row.transactionId,
        contentHash: row.contentHash,
        totalsDisagree: row.totalsDisagree,
        frameCount: await countReceiptFrames(row.id),
        hasProcessed: await hasReceiptProcessed(row.id),
    };
}

@Route('receipts')
@Tags('receipts')
export class ReceiptsController {
    /**
     * @summary listReceipts
     */
    @Get()
    public async listReceipts(): Promise<ReceiptsDto> {
        const receipts = await listReceiptRows();
        return { receipts: await Promise.all(receipts.map(toReceiptDto)) };
    }

    /**
     * @summary createReceipt
     */
    @SuccessResponse(201, 'Created')
    @Response(400, 'Invalid frames')
    @Response(403, 'Practice mode')
    @Response(413, 'JSON body too large')
    @Post()
    public async createReceipt(@Body() body: CreateReceiptDto): Promise<ReceiptDto> {
        const row = await createReceipt({
            frames: body.frames,
            processed: body.processed,
            transactionId: body.transactionId,
        });
        kickReceiptExtractIfPending(row);
        return toReceiptDto(row);
    }

    /**
     * @summary lookupByTransaction
     */
    @Response(403, 'Practice mode')
    @Response(404, 'Not found')
    @Get('lookup-by-transaction')
    public async lookupByTransaction(@Query() transactionId: string): Promise<ReceiptMatchDto> {
        return toReceiptMatchDto(await lookupTransactionRow(transactionId));
    }

    /**
     * @summary lookupByReceipt
     */
    @Response(403, 'Practice mode')
    @Response(404, 'Not found')
    @Get('lookup-by-receipt')
    public async lookupByReceipt(@Query() receiptId: string): Promise<ReceiptMatchDto> {
        return toReceiptMatchDto(await lookupReceiptRow(receiptId));
    }

    /**
     * @summary matchPreview
     */
    @Response(400, 'Invalid preview')
    @Response(404, 'Not found')
    @Post('match-preview')
    public async matchPreview(@Body() body: MatchPreviewDto): Promise<ReceiptMatchDto> {
        return toReceiptMatchDto(await previewReceiptMatch(body));
    }

    /**
     * @summary extractPreview
     */
    @Response(400, 'Invalid frames')
    @Response(503, 'Extract unavailable')
    @Post('extract-preview')
    public async extractPreview(@Body() body: ExtractPreviewDto): Promise<ExtractPreviewResultDto> {
        return previewReceiptExtract(body);
    }

    /**
     * @summary getReceiptImage
     */
    @Response(400, 'Invalid frame')
    @Response(404, 'Not found')
    @Produces('application/octet-stream')
    @Get('{id}/image')
    public async getReceiptImage(
        @Path() id: string,
        @Request() request: ExpressRequest,
        @Query() variant: 'original' | 'processed' = 'original',
        @Query() frame = 0,
    ): Promise<void> {
        const image = await readReceiptImageBytes(id, variant, frame);
        const response = request.res;
        if (!response) {
            throw new HttpError(500, 'Express response was missing on getReceiptImage');
        }
        response.status(200);
        response.setHeader('Content-Type', image.contentType);
        response.send(image.bytes);
    }

    /**
     * @summary getReceipt
     */
    @Response(404, 'Not found')
    @Get('{id}')
    public async getReceipt(@Path() id: string): Promise<ReceiptDto> {
        return toReceiptDto(await requireReceipt(id));
    }

    /**
     * @summary patchReceipt
     */
    @Response(400, 'Invalid extract edit')
    @Response(403, 'Practice mode')
    @Response(404, 'Not found')
    @Response(409, 'Extract still pending')
    @Patch('{id}')
    public async patchReceipt(@Path() id: string, @Body() body: PatchReceiptDto): Promise<ReceiptDto> {
        return toReceiptDto(await patchReceiptRow(id, body));
    }

    /**
     * @summary bindReceipt
     */
    @Response(403, 'Practice mode')
    @Response(404, 'Not found')
    @Post('{id}/bind')
    public async bindReceipt(@Path() id: string, @Body() body: BindReceiptDto): Promise<ReceiptDto> {
        await setReceiptTransactionId(id, body.transactionId);
        return toReceiptDto(await requireReceipt(id));
    }

    /**
     * @summary detachReceipt
     */
    @Response(403, 'Practice mode')
    @Response(404, 'Not found')
    @Delete('{id}/bind')
    public async detachReceipt(@Path() id: string): Promise<ReceiptDto> {
        await setReceiptTransactionId(id, null);
        return toReceiptDto(await requireReceipt(id));
    }

    /**
     * @summary deleteReceipt
     */
    @Response(403, 'Practice mode')
    @Delete('{id}')
    public async deleteReceipt(@Path() id: string): Promise<void> {
        await deleteReceiptRow(id);
    }
}
