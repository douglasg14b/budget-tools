import type { AppDatabaseClient } from '../../data-persistence/database';
import { getOpenRouterApiKey, OPENROUTER_DECISIONS_MODEL, RECEIPT_AUTO_BIND_THRESHOLD } from '../../environment';
import { addIsoDays, PAYMENT_MATCH_LOOKBACK_DAYS } from '../amazonOrders/isoDate';
import type { TransactionDetailDto } from '../categorization/categorizationDtos';
import { getOperatingMode } from '../operatingMode/data/operatingModeRepo';
import type { ReceiptRow } from './data/receiptsRepo';
import {
    bindReceiptIfUnbound,
    listBoundTransactionIds,
    listReceiptsInPurchaseDateWindow,
    listRejectedTransactionIds,
    recordReceiptBindCheck,
} from './data/receiptsRepo';
import type { ReceiptBindCheckOutcome } from './data/receiptsSchema';
import { listTransactionsForReceiptMatch } from './listTransactionsForReceiptMatch';
import { transactionDetailToMatchKeys } from './lookupReceiptMatch';
import { parseReceiptExtract } from './parseReceiptExtract';
import { confirmReceiptBind } from './pipeline/confirmReceiptBind';
import type { ReceiptScoreKeys } from './scoreReceiptBindCandidates';
import { scoreReceiptBindCandidates } from './scoreReceiptBindCandidates';

/** Returns Jev's `same_purchase` probability, or `null` when it gave no answer. Throws when unreachable. */
export type ConfirmPair = (receipt: ReceiptRow, transaction: TransactionDetailDto) => Promise<number | null>;

export type AutoBindDeps = {
    readonly db?: AppDatabaseClient;
    readonly listTransactions?: (purchaseDate: string) => Promise<readonly TransactionDetailDto[]>;
    /** Omit to use Jev; `null` means no key is configured. */
    readonly confirm?: ConfirmPair | null;
    readonly threshold?: number;
};

export type AutoBindResult = {
    readonly outcome: ReceiptBindCheckOutcome;
    readonly transactionId: string | null;
    readonly jevScore: number | null;
};

/**
 * Jev answers per (receipt keys, charge). The sweeper revisits unbound receipts
 * every few minutes; this keeps it from re-asking about a charge Jev already
 * declined. Keyed on the extracted fields so an edited receipt is asked afresh.
 */
const jevAnswers = new Map<string, number>();

export function clearAutoBindJevCache(): void {
    jevAnswers.clear();
}

function cacheKey(receipt: ReceiptRow, transactionId: string): string {
    return [receipt.id, receipt.vendor, receipt.purchaseDate, receipt.printedMilliunits, transactionId].join('|');
}

function defaultConfirm(): ConfirmPair | null {
    const apiKey = getOpenRouterApiKey();
    if (!apiKey) {
        return null;
    }
    return async (receipt, transaction) => {
        const extract = parseReceiptExtract(receipt.extractJson);
        const result = await confirmReceiptBind({
            apiKey,
            model: OPENROUTER_DECISIONS_MODEL,
            receipt: {
                vendor: receipt.vendor,
                purchaseDate: receipt.purchaseDate,
                printedMilliunits: receipt.printedMilliunits,
                taxMilliunits: extract?.taxMilliunits ?? null,
                lines: extract?.lines ?? [],
            },
            transaction: {
                date: transaction.date,
                amountMilliunits: transaction.amount,
                payeeName: transaction.payeeName,
                importPayeeNameOriginal: transaction.importPayeeNameOriginal,
                accountName: transaction.accountName,
            },
        });
        return result.samePurchase;
    };
}

function toScoreKeys(receipt: ReceiptRow): ReceiptScoreKeys {
    return {
        id: receipt.id,
        vendor: receipt.vendor,
        purchaseDate: receipt.purchaseDate,
        printedMilliunits: receipt.printedMilliunits,
        totalsDisagree: receipt.totalsDisagree,
    };
}

function isBindable(receipt: ReceiptRow): boolean {
    return (
        !receipt.transactionId &&
        (receipt.extractStatus === 'gated' || receipt.extractStatus === 'ungated') &&
        Boolean(receipt.purchaseDate) &&
        receipt.printedMilliunits !== null
    );
}

/** Unbound, completed receipts whose payment window could overlap this one's. */
async function listRivalReceipts(receipt: ReceiptRow, db?: AppDatabaseClient): Promise<ReceiptScoreKeys[]> {
    const purchaseDate = receipt.purchaseDate as string;
    const span = PAYMENT_MATCH_LOOKBACK_DAYS + 1;
    const rows = await listReceiptsInPurchaseDateWindow(
        addIsoDays(purchaseDate, -span),
        addIsoDays(purchaseDate, span),
        db,
    );
    return rows.filter((row) => row.id !== receipt.id && isBindable(row)).map(toScoreKeys);
}

/**
 * Binds an unbound Live receipt to its bank charge when the facts allow it and
 * Jev confirms. Deterministic filtering (`scoreReceiptBindCandidates`) only
 * passes exact-amount, unclaimed charges in the payment window; Jev judges each,
 * and the receipt binds only when exactly one clears the threshold. Fails closed:
 * no key or an unreachable Jev leaves the receipt for the next attempt.
 *
 * @returns `null` when the receipt is not eligible for an attempt at all.
 */
export async function autoBindReceipt(receipt: ReceiptRow, deps: AutoBindDeps = {}): Promise<AutoBindResult | null> {
    const { db } = deps;
    if (!isBindable(receipt) || (await getOperatingMode(db)) !== 'live') {
        return null;
    }
    const finish = async (
        outcome: ReceiptBindCheckOutcome,
        transactionId: string | null = null,
        jevScore: number | null = null,
    ): Promise<AutoBindResult> => {
        if (outcome !== 'bound') {
            await recordReceiptBindCheck(receipt.id, outcome, db);
        }
        return { outcome, transactionId, jevScore };
    };

    const listTransactions = deps.listTransactions ?? listTransactionsForReceiptMatch;
    const transactions = await listTransactions(receipt.purchaseDate as string);
    const byId = new Map(transactions.map((transaction) => [transaction.id, transaction]));
    const eligible = scoreReceiptBindCandidates({
        receipt: toScoreKeys(receipt),
        transactions: transactions.map(transactionDetailToMatchKeys),
        boundTransactionIds: await listBoundTransactionIds([...byId.keys()], db),
        rejectedTransactionIds: await listRejectedTransactionIds(receipt.id, db),
        rivalReceipts: await listRivalReceipts(receipt, db),
    }).filter((candidate) => candidate.jevEligible);
    if (eligible.length === 0) {
        return finish('no-candidate');
    }

    const confirm = deps.confirm === undefined ? defaultConfirm() : deps.confirm;
    if (!confirm) {
        return finish('jev-unavailable');
    }
    const threshold = deps.threshold ?? RECEIPT_AUTO_BIND_THRESHOLD;
    const confirmed: { transactionId: string; score: number }[] = [];
    for (const candidate of eligible) {
        const key = cacheKey(receipt, candidate.transactionId);
        let score = jevAnswers.get(key);
        if (score === undefined) {
            let answer: number | null;
            try {
                answer = await confirm(receipt, byId.get(candidate.transactionId) as TransactionDetailDto);
            } catch (error) {
                console.error('receipt auto-bind: Jev unavailable', {
                    receiptId: receipt.id,
                    message: error instanceof Error ? error.message : String(error),
                });
                return finish('jev-unavailable');
            }
            // A missing answer is not a decline: leave it uncached so the next attempt asks again.
            if (answer === null) {
                return finish('jev-unavailable');
            }
            score = answer;
            jevAnswers.set(key, score);
        }
        if (score >= threshold) {
            confirmed.push({ transactionId: candidate.transactionId, score });
        }
    }

    const [only, ...others] = confirmed;
    if (!only) {
        return finish('not-confirmed');
    }
    if (others.length > 0) {
        return finish('ambiguous');
    }
    if (!(await bindReceiptIfUnbound(receipt.id, only.transactionId, only.score, db))) {
        return { outcome: 'lost-race', transactionId: null, jevScore: null };
    }
    return finish('bound', only.transactionId, only.score);
}

/** Fire-and-forget auto-bind for request and extract paths; errors are logged, never thrown. */
export function autoBindReceiptInBackground(receipt: ReceiptRow): void {
    void autoBindReceipt(receipt).catch((error: unknown) => {
        console.error('receipt auto-bind failed', {
            receiptId: receipt.id,
            message: error instanceof Error ? error.message : String(error),
        });
    });
}
