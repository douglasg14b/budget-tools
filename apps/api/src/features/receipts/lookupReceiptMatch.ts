import type { AppDatabaseClient } from '../../data-persistence/database';
import type { TransactionDetailDto } from '../categorization/categorizationDtos';
import { listTransactionsByIds } from '../categorization/listTransactionsByIds';
import { HttpError, NotFoundError } from '../travelWindows/HttpError';
import { assertReceiptLiveLookupAllowed } from './assertReceiptLiveLookupAllowed';
import { listReceiptsInPurchaseDateWindow, requireReceipt } from './data/receiptsRepo';
import { listTransactionsForReceiptMatch } from './listTransactionsForReceiptMatch';
import type { BankTransactionMatchKeys, ReceiptMatchKeys, ReceiptTransactionMatch } from './matchReceipts';
import { matchReceiptsToTransaction, matchTransactionsToReceipt } from './matchReceipts';
import { paymentDateWindow } from './paymentDateWindow';
import type { MatchPreviewDto, MatchPreviewTransactionDto, ReceiptMatchDto } from './receiptsDtos';

export function toReceiptMatchDto(match: ReceiptTransactionMatch): ReceiptMatchDto {
    return {
        amazonSkipped: match.amazonSkipped,
        autoBind: match.autoBind,
        exactReceiptId: match.exactReceiptId,
        exactTransactionId: match.exactTransactionId,
        closeMatches: [...match.closeMatches],
    };
}

export function receiptRowToMatchKeys(row: {
    readonly id: string;
    readonly vendor: string | null;
    readonly purchaseDate: string | null;
    readonly printedMilliunits: number | null;
    readonly totalsDisagree: boolean;
}): ReceiptMatchKeys {
    return {
        id: row.id,
        vendor: row.vendor,
        purchaseDate: row.purchaseDate,
        printedMilliunits: row.printedMilliunits,
        totalsDisagree: row.totalsDisagree,
    };
}

export function transactionDetailToMatchKeys(transaction: TransactionDetailDto): BankTransactionMatchKeys {
    return {
        id: transaction.id,
        date: transaction.date,
        amountMilliunits: transaction.amount,
        payeeName: transaction.payeeName,
        importPayeeName: transaction.importPayeeName,
        importPayeeNameOriginal: transaction.importPayeeNameOriginal,
    };
}

function previewTransactionToMatchKeys(transaction: MatchPreviewTransactionDto): BankTransactionMatchKeys {
    return {
        id: transaction.id,
        date: transaction.date,
        amountMilliunits: transaction.amount,
        payeeName: transaction.payeeName,
        importPayeeName: transaction.importPayeeName,
        importPayeeNameOriginal: transaction.importPayeeNameOriginal,
    };
}

/**
 * Live SQLite keys only. Does not start extract.
 */
export async function lookupByTransaction(
    transactionId: string,
    db?: AppDatabaseClient,
): Promise<ReceiptTransactionMatch> {
    await assertReceiptLiveLookupAllowed(db);
    const [transaction] = await listTransactionsByIds([transactionId]);
    if (!transaction) {
        throw new NotFoundError(`transaction not found: ${transactionId}`);
    }
    const window = paymentDateWindow(transaction.date);
    const receipts = await listReceiptsInPurchaseDateWindow(window.earliestDate, window.latestDate, db);
    return matchReceiptsToTransaction({
        transaction: transactionDetailToMatchKeys(transaction),
        receipts: receipts.map(receiptRowToMatchKeys),
    });
}

/**
 * Live receipt row plus Postgres window. Does not start extract.
 * Missing purchaseDate (extract not ready) yields no bank candidates — not an HTTP error.
 */
export async function lookupByReceipt(receiptId: string, db?: AppDatabaseClient): Promise<ReceiptTransactionMatch> {
    await assertReceiptLiveLookupAllowed(db);
    const receipt = await requireReceipt(receiptId, db);
    if (!receipt.purchaseDate) {
        return matchTransactionsToReceipt({
            receipt: receiptRowToMatchKeys(receipt),
            transactions: [],
        });
    }
    const transactions = await listTransactionsForReceiptMatch(receipt.purchaseDate);
    return matchTransactionsToReceipt({
        receipt: receiptRowToMatchKeys(receipt),
        transactions: transactions.map(transactionDetailToMatchKeys),
    });
}

function previewTransactionSource(
    body: MatchPreviewDto,
):
    | { readonly kind: 'fields'; readonly transaction: MatchPreviewTransactionDto }
    | { readonly kind: 'id'; readonly transactionId: string } {
    if (body.transaction && !body.transactionId) {
        return { kind: 'fields', transaction: body.transaction };
    }
    if (body.transactionId && !body.transaction) {
        return { kind: 'id', transactionId: body.transactionId };
    }
    throw new HttpError(400, 'match-preview requires exactly one of transaction or transactionId');
}

/**
 * Practice/ephemeral match. Writes nothing to SQLite or the filesystem.
 */
export async function matchPreview(body: MatchPreviewDto): Promise<ReceiptTransactionMatch> {
    if (body.receipts.length === 0) {
        throw new HttpError(400, 'match-preview requires at least one receipt');
    }

    const receipts = body.receipts.map(receiptRowToMatchKeys);
    const source = previewTransactionSource(body);
    if (source.kind === 'fields') {
        return matchReceiptsToTransaction({
            transaction: previewTransactionToMatchKeys(source.transaction),
            receipts,
        });
    }

    const [transaction] = await listTransactionsByIds([source.transactionId]);
    if (!transaction) {
        throw new NotFoundError(`transaction not found: ${source.transactionId}`);
    }
    return matchReceiptsToTransaction({
        transaction: transactionDetailToMatchKeys(transaction),
        receipts,
    });
}
