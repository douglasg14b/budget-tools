import type { AppDatabaseClient } from '../../data-persistence/database';
import { utcTodayIso } from '../amazonOrders/isoDate';
import type { TransactionDetailDto } from '../categorization/categorizationDtos';
import { listTransactionsByIds } from '../categorization/listTransactionsByIds';
import { HttpError, NotFoundError } from '../travelWindows/HttpError';
import { assertReceiptLiveLookupAllowed } from './assertReceiptLiveLookupAllowed';
import { getReceiptByTransactionId, listReceiptsInPurchaseDateWindow, requireReceipt } from './data/receiptsRepo';
import type { ReceiptExtractStatus } from './data/receiptsSchema';
import { listTransactionsForReceiptMatch } from './listTransactionsForReceiptMatch';
import type { BankTransactionMatchKeys, ReceiptMatchKeys, ReceiptTransactionMatch } from './matchReceipts';
import { matchReceiptsToTransaction, matchTransactionsToReceipt } from './matchReceipts';
import { paymentDateWindow } from './paymentDateWindow';
import { parseReceiptSearchExtraDays } from './receiptSearchRange';
import type {
    MatchPreviewDto,
    MatchPreviewTransactionDto,
    ReceiptBindCandidateDto,
    ReceiptMatchDto,
    ReceiptSplitDraftDto,
} from './receiptsDtos';
import { reimbursableCategoryFor } from './reimbursableCategory';
import { seedReceiptSplitDraft } from './seedReceiptSplitDraft';

export type ReceiptLookupResult = ReceiptTransactionMatch & {
    readonly bindCandidates: readonly ReceiptBindCandidateDto[];
    readonly splitDraft: ReceiptSplitDraftDto | null;
};

export type ListReceiptMatchTransactions = (
    anchorDate: string,
    extraDays: number,
) => Promise<readonly TransactionDetailDto[]>;

const listWindowForReceiptMatch: ListReceiptMatchTransactions = (anchorDate, extraDays) =>
    listTransactionsForReceiptMatch(anchorDate, undefined, extraDays);

export function toReceiptMatchDto(match: ReceiptLookupResult): ReceiptMatchDto {
    return {
        amazonSkipped: match.amazonSkipped,
        autoBind: match.autoBind,
        exactReceiptId: match.exactReceiptId,
        exactTransactionId: match.exactTransactionId,
        closeMatches: [...match.closeMatches],
        bindCandidates: [...match.bindCandidates],
        splitDraft: match.splitDraft,
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

export function transactionDetailToBindCandidate(transaction: TransactionDetailDto): ReceiptBindCandidateDto {
    return {
        id: transaction.id,
        date: transaction.date,
        amount: transaction.amount,
        payeeName: transaction.payeeName,
        importPayeeName: transaction.importPayeeName,
        importPayeeNameOriginal: transaction.importPayeeNameOriginal,
        accountName: transaction.accountName,
        categoryName: transaction.categoryName,
        memo: transaction.memo,
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

function withCandidates(
    match: ReceiptTransactionMatch,
    transactions: readonly TransactionDetailDto[] = [],
    splitDraft: ReceiptSplitDraftDto | null = null,
): ReceiptLookupResult {
    return {
        ...match,
        bindCandidates: transactions.map(transactionDetailToBindCandidate),
        splitDraft,
    };
}

/**
 * Live SQLite keys only. Does not start extract.
 */
export async function lookupByTransaction(transactionId: string, db?: AppDatabaseClient): Promise<ReceiptLookupResult> {
    await assertReceiptLiveLookupAllowed(db);
    const [transaction] = await listTransactionsByIds([transactionId]);
    if (!transaction) {
        throw new NotFoundError(`transaction not found: ${transactionId}`);
    }
    const window = paymentDateWindow(transaction.date);
    const receipts = await listReceiptsInPurchaseDateWindow(window.earliestDate, window.latestDate, db);
    const match = matchReceiptsToTransaction({
        transaction: transactionDetailToMatchKeys(transaction),
        receipts: receipts.map(receiptRowToMatchKeys),
    });
    const bound = await getReceiptByTransactionId(transactionId, db);
    const exact = match.exactReceiptId ? (receipts.find((row) => row.id === match.exactReceiptId) ?? bound) : bound;
    return withCandidates(match, [], await splitDraftFor(exact, transaction.amount));
}

/**
 * Live receipt row plus Postgres window. Does not start extract.
 * `extraDays` widens only the search list: matching and auto-bind still judge the default window.
 * Without a purchaseDate there is nothing to anchor on, so the list stays empty until the user
 * widens it — then it centres on the day the receipt was captured. Not an HTTP error either way.
 */
export async function lookupByReceipt(
    receiptId: string,
    db?: AppDatabaseClient,
    extraDays = 0,
): Promise<ReceiptLookupResult> {
    await assertReceiptLiveLookupAllowed(db);
    const receipt = await requireReceipt(receiptId, db);
    const anchor = receipt.purchaseDate ?? (extraDays > 0 ? receipt.createdAt.slice(0, 10) : null);
    const windowed = anchor ? await listTransactionsForReceiptMatch(anchor, undefined, extraDays) : [];
    // A bound charge can sit outside the window (picked via a widened search, or a wrong receipt
    // date); keep it listed so the panel still shows what the receipt is bound to.
    const transactions = await withBoundTransaction(windowed, receipt.transactionId);
    if (!receipt.purchaseDate) {
        return withCandidates(
            matchTransactionsToReceipt({
                receipt: receiptRowToMatchKeys(receipt),
                transactions: [],
            }),
            transactions,
        );
    }
    const match = matchTransactionsToReceipt({
        receipt: receiptRowToMatchKeys(receipt),
        transactions: transactions.map(transactionDetailToMatchKeys),
    });
    const bank = transactions.find((row) => row.id === (match.exactTransactionId ?? receipt.transactionId));
    return withCandidates(match, transactions, await splitDraftFor(receipt, bank?.amount ?? null));
}

async function withBoundTransaction(
    transactions: readonly TransactionDetailDto[],
    boundTransactionId: string | null,
): Promise<readonly TransactionDetailDto[]> {
    if (!boundTransactionId || transactions.some((row) => row.id === boundTransactionId)) {
        return transactions;
    }
    const [bound] = await listTransactionsByIds([boundTransactionId]);
    return bound ? [...transactions, bound] : transactions;
}

function previewTransactionSource(
    body: MatchPreviewDto,
):
    | { readonly kind: 'fields'; readonly transaction: MatchPreviewTransactionDto }
    | { readonly kind: 'id'; readonly transactionId: string }
    | { readonly kind: 'receipt' } {
    if (body.transaction && body.transactionId) {
        throw new HttpError(400, 'match-preview requires exactly one of transaction or transactionId');
    }
    if (body.transaction) {
        return { kind: 'fields', transaction: body.transaction };
    }
    if (body.transactionId) {
        return { kind: 'id', transactionId: body.transactionId };
    }
    return { kind: 'receipt' };
}

/**
 * Practice/ephemeral match. Writes nothing to SQLite or the filesystem.
 * Receipt-only preview lists the purchase-date window (Amazon excluded) for inbox search.
 */
export async function matchPreview(
    body: MatchPreviewDto,
    listWindowTransactions: ListReceiptMatchTransactions = listWindowForReceiptMatch,
): Promise<ReceiptLookupResult> {
    if (body.receipts.length === 0) {
        throw new HttpError(400, 'match-preview requires at least one receipt');
    }

    const receipts = body.receipts.map(receiptRowToMatchKeys);
    const source = previewTransactionSource(body);
    if (source.kind === 'fields') {
        const match = matchReceiptsToTransaction({
            transaction: previewTransactionToMatchKeys(source.transaction),
            receipts,
        });
        const exact = body.receipts.find((row) => row.id === match.exactReceiptId);
        return withCandidates(match, [], await splitDraftFor(exact, source.transaction.amount));
    }
    if (source.kind === 'id') {
        const [transaction] = await listTransactionsByIds([source.transactionId]);
        if (!transaction) {
            throw new NotFoundError(`transaction not found: ${source.transactionId}`);
        }
        const match = matchReceiptsToTransaction({
            transaction: transactionDetailToMatchKeys(transaction),
            receipts,
        });
        const exact = body.receipts.find((row) => row.id === match.exactReceiptId);
        return withCandidates(match, [], await splitDraftFor(exact, transaction.amount));
    }

    const only = body.receipts[0];
    if (body.receipts.length !== 1 || !only) {
        throw new HttpError(400, 'receipt-toward-bank match-preview requires exactly one receipt');
    }
    const extraDays = parseReceiptSearchExtraDays(body.extraDays);
    // A session receipt has no capture time, so a dateless one centres a widened search on today.
    const anchor = only.purchaseDate ?? (extraDays > 0 ? utcTodayIso() : null);
    if (!only.purchaseDate) {
        return withCandidates(
            matchTransactionsToReceipt({
                receipt: receiptRowToMatchKeys(only),
                transactions: [],
            }),
            anchor ? await listWindowTransactions(anchor, extraDays) : [],
        );
    }
    const transactions = await listWindowTransactions(only.purchaseDate, extraDays);
    const match = matchTransactionsToReceipt({
        receipt: receiptRowToMatchKeys(only),
        transactions: transactions.map(transactionDetailToMatchKeys),
    });
    const bank = transactions.find((row) => row.id === match.exactTransactionId);
    return withCandidates(match, transactions, await splitDraftFor(only, bank?.amount ?? null));
}

/** Stored rows and Practice preview receipts alike; preview receipts may omit the extract. */
async function splitDraftFor(
    row:
        | {
              readonly extractStatus?: ReceiptExtractStatus | null;
              readonly totalsDisagree: boolean;
              readonly extractJson?: string | null;
          }
        | undefined,
    bankMilliunits: number | null,
): Promise<ReceiptSplitDraftDto | null> {
    if (!row || bankMilliunits == null) {
        return null;
    }
    return seedReceiptSplitDraft({
        extractStatus: row.extractStatus ?? null,
        totalsDisagree: row.totalsDisagree,
        bankMilliunits,
        extractJson: row.extractJson ?? null,
        reimbursableCategory: await reimbursableCategoryFor(row.extractJson),
    });
}
