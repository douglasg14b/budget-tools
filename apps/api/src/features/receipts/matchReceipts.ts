import { isAmazonTransaction } from '../amazonClassify/isAmazonTransaction';
import { isSamePayee, RAW_PAYEE_SIMILARITY_THRESHOLD } from '../categorization/llm/looksLikeImportName';
import { nameSimilarity } from '../categorization/nameSimilarity';
import { isDateInPaymentWindow } from './paymentDateWindow';

/** Same bar as `looksLikeImportName` RAW_PAYEE_SIMILARITY_THRESHOLD. */
export const FUZZY_PAYEE_SIMILARITY_MIN = RAW_PAYEE_SIMILARITY_THRESHOLD;
export const FUZZY_TIP_CAP = 0.3;

export type ReceiptMatchKeys = {
    readonly id: string;
    readonly vendor: string | null;
    readonly purchaseDate: string | null;
    readonly printedMilliunits: number | null;
    readonly totalsDisagree: boolean;
};

export type BankTransactionMatchKeys = {
    readonly id: string;
    readonly date: string;
    readonly amountMilliunits: number;
    readonly payeeName: string | null;
    readonly importPayeeName: string | null;
    readonly importPayeeNameOriginal: string | null;
};

export type ClosePairReason = 'fuzzy-tip' | 'blocked-exact';

export type ClosePairMatch = {
    readonly receiptId: string;
    readonly transactionId: string;
    readonly reason: ClosePairReason;
    readonly payeeSimilarity: number;
    readonly tipMilliunits: number;
    readonly tipRatio: number;
};

export type ReceiptTransactionMatch = {
    readonly amazonSkipped: boolean;
    readonly autoBind: boolean;
    readonly exactReceiptId: string | null;
    readonly exactTransactionId: string | null;
    readonly closeMatches: readonly ClosePairMatch[];
};

type MatchReceiptsToTransactionInput = {
    readonly transaction: BankTransactionMatchKeys;
    readonly receipts: readonly ReceiptMatchKeys[];
};

type MatchTransactionsToReceiptInput = {
    readonly receipt: ReceiptMatchKeys;
    readonly transactions: readonly BankTransactionMatchKeys[];
};

function emptyMatch(amazonSkipped: boolean): ReceiptTransactionMatch {
    return {
        amazonSkipped,
        autoBind: false,
        exactReceiptId: null,
        exactTransactionId: null,
        closeMatches: [],
    };
}

function payeeHaystack(transaction: BankTransactionMatchKeys): string[] {
    return [transaction.payeeName, transaction.importPayeeName, transaction.importPayeeNameOriginal].filter(
        (part): part is string => Boolean(part?.trim()),
    );
}

function bestPayeeSimilarity(vendor: string, transaction: BankTransactionMatchKeys): number {
    const haystack = payeeHaystack(transaction);
    if (haystack.length === 0) {
        return 0;
    }
    return Math.max(...haystack.map((part) => nameSimilarity(vendor, part)));
}

function vendorMatchesExact(vendor: string, transaction: BankTransactionMatchKeys): boolean {
    return payeeHaystack(transaction).some((part) => isSamePayee(vendor, part));
}

function pairInWindow(receipt: ReceiptMatchKeys, transaction: BankTransactionMatchKeys): boolean {
    if (!receipt.purchaseDate) {
        return false;
    }
    return isDateInPaymentWindow(receipt.purchaseDate, transaction.date);
}

function absOrNull(value: number | null): number | null {
    if (value === null) {
        return null;
    }
    return Math.abs(value);
}

function canAutoBindExact(receipt: ReceiptMatchKeys, transaction: BankTransactionMatchKeys): boolean {
    if (receipt.totalsDisagree || !receipt.vendor || !receipt.purchaseDate) {
        return false;
    }
    return vendorMatchesExact(receipt.vendor, transaction);
}

function fuzzyTipRatio(bankAbs: number, printedAbs: number): number | null {
    if (printedAbs === 0) {
        return null;
    }
    if (bankAbs <= printedAbs) {
        return null;
    }
    return (bankAbs - printedAbs) / printedAbs;
}

function canFuzzyTip(
    receipt: ReceiptMatchKeys,
    transaction: BankTransactionMatchKeys,
    payeeSimilarity: number,
): boolean {
    if (!receipt.vendor || payeeSimilarity < FUZZY_PAYEE_SIMILARITY_MIN) {
        return false;
    }
    const printedAbs = absOrNull(receipt.printedMilliunits);
    if (printedAbs === null) {
        return false;
    }
    const ratio = fuzzyTipRatio(Math.abs(transaction.amountMilliunits), printedAbs);
    return ratio !== null && ratio <= FUZZY_TIP_CAP;
}

function closeMatchFor(
    receipt: ReceiptMatchKeys,
    transaction: BankTransactionMatchKeys,
    reason: ClosePairReason,
    payeeSimilarity: number,
): ClosePairMatch {
    const printedAbs = absOrNull(receipt.printedMilliunits) ?? 0;
    const bankAbs = Math.abs(transaction.amountMilliunits);
    const tipMilliunits = Math.max(0, bankAbs - printedAbs);
    const tipRatio = printedAbs === 0 ? 0 : tipMilliunits / printedAbs;
    return {
        receiptId: receipt.id,
        transactionId: transaction.id,
        reason,
        payeeSimilarity,
        tipMilliunits,
        tipRatio,
    };
}

function rankCloseMatches(matches: readonly ClosePairMatch[]): ClosePairMatch[] {
    return [...matches].sort((left, right) => {
        if (left.tipRatio !== right.tipRatio) {
            return left.tipRatio - right.tipRatio;
        }
        return right.payeeSimilarity - left.payeeSimilarity;
    });
}

function similarityFor(receipt: ReceiptMatchKeys, transaction: BankTransactionMatchKeys): number {
    if (!receipt.vendor) {
        return 0;
    }
    return bestPayeeSimilarity(receipt.vendor, transaction);
}

function amountMatches(receipt: ReceiptMatchKeys, transaction: BankTransactionMatchKeys): boolean {
    const printedAbs = absOrNull(receipt.printedMilliunits);
    if (printedAbs === null) {
        return false;
    }
    return printedAbs === Math.abs(transaction.amountMilliunits);
}

function collectFuzzyReceipts(
    receipts: readonly ReceiptMatchKeys[],
    transaction: BankTransactionMatchKeys,
    excludeReceiptId: string | null,
): ClosePairMatch[] {
    const matches: ClosePairMatch[] = [];
    for (const receipt of receipts) {
        if (receipt.id === excludeReceiptId || !pairInWindow(receipt, transaction)) {
            continue;
        }
        const payeeSimilarity = similarityFor(receipt, transaction);
        if (!canFuzzyTip(receipt, transaction, payeeSimilarity)) {
            continue;
        }
        matches.push(closeMatchFor(receipt, transaction, 'fuzzy-tip', payeeSimilarity));
    }
    return matches;
}

function collectFuzzyTransactions(
    receipt: ReceiptMatchKeys,
    transactions: readonly BankTransactionMatchKeys[],
    excludeTransactionId: string | null,
): ClosePairMatch[] {
    const matches: ClosePairMatch[] = [];
    for (const transaction of transactions) {
        if (transaction.id === excludeTransactionId || !pairInWindow(receipt, transaction)) {
            continue;
        }
        const payeeSimilarity = similarityFor(receipt, transaction);
        if (!canFuzzyTip(receipt, transaction, payeeSimilarity)) {
            continue;
        }
        matches.push(closeMatchFor(receipt, transaction, 'fuzzy-tip', payeeSimilarity));
    }
    return matches;
}

/**
 * Transaction → receipts. Amazon bank rows never match. Exact unique auto-bind never includes fuzzy hits.
 */
export function matchReceiptsToTransaction(input: MatchReceiptsToTransactionInput): ReceiptTransactionMatch {
    const { transaction, receipts } = input;
    if (isAmazonTransaction(transaction)) {
        return emptyMatch(true);
    }

    const inWindow = receipts.filter((receipt) => pairInWindow(receipt, transaction));
    const exactAmount = inWindow.filter((receipt) => amountMatches(receipt, transaction));

    if (exactAmount.length === 1) {
        const only = exactAmount[0];
        if (!only) {
            return emptyMatch(false);
        }
        const payeeSimilarity = similarityFor(only, transaction);
        if (canAutoBindExact(only, transaction)) {
            return {
                amazonSkipped: false,
                autoBind: true,
                exactReceiptId: only.id,
                exactTransactionId: transaction.id,
                closeMatches: rankCloseMatches(collectFuzzyReceipts(inWindow, transaction, only.id)),
            };
        }
        return {
            amazonSkipped: false,
            autoBind: false,
            exactReceiptId: null,
            exactTransactionId: null,
            closeMatches: rankCloseMatches([
                closeMatchFor(only, transaction, 'blocked-exact', payeeSimilarity),
                ...collectFuzzyReceipts(inWindow, transaction, only.id),
            ]),
        };
    }

    return {
        amazonSkipped: false,
        autoBind: false,
        exactReceiptId: null,
        exactTransactionId: null,
        closeMatches: rankCloseMatches(collectFuzzyReceipts(inWindow, transaction, null)),
    };
}

/**
 * Receipt → transactions. Amazon bank rows are dropped before uniqueness.
 */
export function matchTransactionsToReceipt(input: MatchTransactionsToReceiptInput): ReceiptTransactionMatch {
    const { receipt, transactions } = input;
    const amazonOnly = transactions.length > 0 && transactions.every((transaction) => isAmazonTransaction(transaction));
    if (amazonOnly) {
        return emptyMatch(true);
    }
    const candidates = transactions.filter((transaction) => !isAmazonTransaction(transaction));
    const inWindow = candidates.filter((transaction) => pairInWindow(receipt, transaction));
    const exactAmount = inWindow.filter((transaction) => amountMatches(receipt, transaction));

    if (exactAmount.length === 1) {
        const only = exactAmount[0];
        if (!only) {
            return emptyMatch(false);
        }
        const payeeSimilarity = similarityFor(receipt, only);
        if (canAutoBindExact(receipt, only)) {
            return {
                amazonSkipped: false,
                autoBind: true,
                exactReceiptId: receipt.id,
                exactTransactionId: only.id,
                closeMatches: rankCloseMatches(collectFuzzyTransactions(receipt, inWindow, only.id)),
            };
        }
        return {
            amazonSkipped: false,
            autoBind: false,
            exactReceiptId: null,
            exactTransactionId: null,
            closeMatches: rankCloseMatches([
                closeMatchFor(receipt, only, 'blocked-exact', payeeSimilarity),
                ...collectFuzzyTransactions(receipt, inWindow, only.id),
            ]),
        };
    }

    return {
        amazonSkipped: false,
        autoBind: false,
        exactReceiptId: null,
        exactTransactionId: null,
        closeMatches: rankCloseMatches(collectFuzzyTransactions(receipt, inWindow, null)),
    };
}
