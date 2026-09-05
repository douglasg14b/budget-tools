import type { AppDatabaseClient } from '../../data-persistence/database';
import { isIsoDate } from '../amazonOrders/isoDate';
import { ConflictError, HttpError } from '../travelWindows/HttpError';
import { applyReceiptExtractEdit } from './applyReceiptExtractEdit';
import type { ReceiptRow } from './data/receiptsRepo';
import { requireReceipt, setReceiptExtract } from './data/receiptsRepo';
import type { PatchReceiptDto, PatchReceiptLineDto } from './receiptsDtos';

/**
 * Live reviewer edit of match keys and line items. Practice must not call this.
 */
export async function patchReceipt(id: string, body: PatchReceiptDto, db?: AppDatabaseClient): Promise<ReceiptRow> {
    const row = await requireReceipt(id, db);
    if (row.extractStatus === 'pending') {
        throw new ConflictError('Wait until extract finishes before editing this receipt');
    }
    const edit = {
        vendor: body.vendor,
        purchaseDate: parsePurchaseDate(body.purchaseDate),
        printedMilliunits: body.printedMilliunits,
        taxMilliunits: body.taxMilliunits,
        discountMilliunits: body.discountMilliunits,
        lines: body.lines.map(toExtractLine),
    };
    const result = applyReceiptExtractEdit({ previousExtractJson: row.extractJson, edit });
    if (result.kind === 'amazon') {
        throw new HttpError(400, 'Amazon receipts are not stored in this inbox');
    }
    await setReceiptExtract(
        id,
        {
            extractStatus: result.extractStatus,
            extractJson: result.extractJson,
            rawText: result.rawText,
            vendor: result.vendor,
            purchaseDate: result.purchaseDate,
            printedMilliunits: result.printedMilliunits,
            totalsDisagree: result.totalsDisagree,
        },
        db,
    );
    return requireReceipt(id, db);
}

function parsePurchaseDate(value: string | null): string | null {
    if (value == null || value.trim() === '') {
        return null;
    }
    const trimmed = value.trim();
    if (!isIsoDate(trimmed)) {
        throw new HttpError(400, 'purchaseDate must be YYYY-MM-DD');
    }
    return trimmed;
}

function toExtractLine(line: PatchReceiptLineDto): {
    readonly name: string;
    readonly amountMilliunits: number | null;
    readonly quantity: number | null;
} {
    return {
        name: line.name,
        amountMilliunits: line.amountMilliunits ?? null,
        quantity: line.quantity ?? null,
    };
}
