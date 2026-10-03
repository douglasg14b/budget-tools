import { isAmazonTransaction } from '../amazonClassify/isAmazonTransaction';
import { nameSimilarity } from '../categorization/nameSimilarity';
import type { BankTransactionMatchKeys } from './matchReceipts';
import { FUZZY_TIP_CAP } from './matchReceipts';
import { isDateInPaymentWindow } from './paymentDateWindow';

/**
 * Deterministic half of receipt auto-binding. It applies only facts that hold
 * for any receipt and any merchant — exact cents, the payment date window,
 * outflow direction, and what is already bound — and decides nothing about
 * names. Whether the merchant and purchase are the same is Jev's call
 * (`confirmReceiptBind`), so no merchant-specific normalization lives here.
 */

export type ReceiptScoreKeys = {
    readonly id: string;
    readonly vendor: string | null;
    readonly purchaseDate: string | null;
    readonly printedMilliunits: number | null;
    readonly totalsDisagree: boolean;
};

export type AmountAgreement = 'exact' | 'tip';

export type BlockReason =
    | 'not-exact-amount'
    | 'totals-disagree'
    | 'missing-vendor'
    | 'already-bound'
    | 'rejected'
    | 'rival-receipt';

export type ScoredCandidate = {
    readonly transactionId: string;
    readonly amount: AmountAgreement;
    /** Bank posting date minus purchase date, in days. */
    readonly dayOffset: number;
    readonly tipMilliunits: number;
    /** Plain name similarity, for ordering suggestions only. Never gates a bind. */
    readonly payeeSimilarity: number;
    /** Every deterministic gate passed; Jev decides the rest. */
    readonly jevEligible: boolean;
    readonly blockedBy: readonly BlockReason[];
};

export type ScoreReceiptBindInput = {
    readonly receipt: ReceiptScoreKeys;
    readonly transactions: readonly BankTransactionMatchKeys[];
    /** Transactions already bound to some other receipt. */
    readonly boundTransactionIds?: ReadonlySet<string>;
    /** Transactions a person detached from this receipt; never offered again. */
    readonly rejectedTransactionIds?: ReadonlySet<string>;
    /** Other unbound receipts. One that also matches a charge exactly makes it ambiguous. */
    readonly rivalReceipts?: readonly ReceiptScoreKeys[];
};

const MS_PER_DAY = 86_400_000;

function dayOffset(purchaseDate: string, bankDate: string): number {
    return Math.round((Date.parse(`${bankDate}T00:00:00Z`) - Date.parse(`${purchaseDate}T00:00:00Z`)) / MS_PER_DAY);
}

function amountAgreement(printedAbs: number, bankAbs: number): AmountAgreement | null {
    if (printedAbs === bankAbs) {
        return 'exact';
    }
    if (printedAbs > 0 && bankAbs > printedAbs && (bankAbs - printedAbs) / printedAbs <= FUZZY_TIP_CAP) {
        return 'tip';
    }
    return null;
}

function bestPayeeSimilarity(vendor: string | null, transaction: BankTransactionMatchKeys): number {
    const haystack = [transaction.payeeName, transaction.importPayeeName, transaction.importPayeeNameOriginal].filter(
        (part): part is string => Boolean(part?.trim()),
    );
    if (!vendor?.trim() || haystack.length === 0) {
        return 0;
    }
    return Math.max(...haystack.map((part) => nameSimilarity(vendor, part)));
}

function matchesExactly(receipt: ReceiptScoreKeys, transaction: BankTransactionMatchKeys): boolean {
    return (
        receipt.printedMilliunits !== null &&
        receipt.purchaseDate !== null &&
        Math.abs(receipt.printedMilliunits) === Math.abs(transaction.amountMilliunits) &&
        isDateInPaymentWindow(receipt.purchaseDate, transaction.date)
    );
}

/**
 * Charges in the receipt's window whose amount agrees exactly or as a
 * plausible tip. Exact, unclaimed charges are `jevEligible`; tips are
 * suggestions only. Several eligible charges are fine — Jev scores each and
 * the caller binds only when exactly one is confirmed.
 */
export function scoreReceiptBindCandidates(input: ScoreReceiptBindInput): ScoredCandidate[] {
    const { receipt } = input;
    if (!receipt.purchaseDate || receipt.printedMilliunits === null) {
        return [];
    }
    const purchaseDate = receipt.purchaseDate;
    const printedAbs = Math.abs(receipt.printedMilliunits);
    const bound = input.boundTransactionIds ?? new Set<string>();
    const rejected = input.rejectedTransactionIds ?? new Set<string>();
    const rivals = (input.rivalReceipts ?? []).filter((rival) => rival.id !== receipt.id);

    return (
        input.transactions
            // Receipts are purchases: a deposit that happens to share the total is never the charge.
            .filter((transaction) => transaction.amountMilliunits < 0)
            .filter((transaction) => !isAmazonTransaction(transaction))
            .filter((transaction) => isDateInPaymentWindow(purchaseDate, transaction.date))
            .flatMap((transaction): ScoredCandidate[] => {
                const bankAbs = Math.abs(transaction.amountMilliunits);
                const amount = amountAgreement(printedAbs, bankAbs);
                if (!amount) {
                    return [];
                }
                const blockedBy: BlockReason[] = [];
                if (amount !== 'exact') {
                    blockedBy.push('not-exact-amount');
                }
                if (receipt.totalsDisagree) {
                    blockedBy.push('totals-disagree');
                }
                if (!receipt.vendor?.trim()) {
                    blockedBy.push('missing-vendor');
                }
                if (bound.has(transaction.id)) {
                    blockedBy.push('already-bound');
                }
                if (rejected.has(transaction.id)) {
                    blockedBy.push('rejected');
                }
                if (rivals.some((rival) => matchesExactly(rival, transaction))) {
                    blockedBy.push('rival-receipt');
                }
                return [
                    {
                        transactionId: transaction.id,
                        amount,
                        dayOffset: dayOffset(purchaseDate, transaction.date),
                        tipMilliunits: Math.max(0, bankAbs - printedAbs),
                        payeeSimilarity: Math.round(bestPayeeSimilarity(receipt.vendor, transaction) * 1000) / 1000,
                        jevEligible: blockedBy.length === 0,
                        blockedBy,
                    },
                ];
            })
            .sort(
                (left, right) =>
                    Number(right.amount === 'exact') - Number(left.amount === 'exact') ||
                    right.payeeSimilarity - left.payeeSimilarity ||
                    left.tipMilliunits - right.tipMilliunits,
            )
    );
}
