import type { Request as ExpressRequest } from 'express';
import { Body, Delete, Get, Path, Post, Produces, Query, Request, Response, Route, SuccessResponse, Tags } from 'tsoa';

import { HttpError } from '../travelWindows/HttpError';
import { createReceipt } from './createReceipt';
import type { ReceiptRow } from './data/receiptsRepo';
import {
    countReceiptFrames,
    deleteReceipt as deleteReceiptRow,
    listReceipts as listReceiptRows,
    readReceiptOriginalBytes,
    requireReceipt,
    setReceiptTransactionId,
} from './data/receiptsRepo';
import type { BindReceiptDto, CreateReceiptDto, ReceiptDto, ReceiptsDto } from './receiptsDtos';

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
        transactionId: row.transactionId,
        contentHash: row.contentHash,
        totalsDisagree: row.totalsDisagree,
        frameCount: await countReceiptFrames(row.originalPath),
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
        return toReceiptDto(
            await createReceipt({
                frames: body.frames,
                transactionId: body.transactionId,
            }),
        );
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
        @Query() frame = 0,
    ): Promise<void> {
        const original = await readReceiptOriginalBytes(id, undefined, frame);
        const response = request.res;
        if (!response) {
            throw new HttpError(500, 'Express response was missing on getReceiptImage');
        }
        response.status(200);
        response.setHeader('Content-Type', original.contentType);
        response.send(original.bytes);
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
