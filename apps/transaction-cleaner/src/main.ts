import dayjs from 'dayjs';
import * as ynab from 'ynab';
import { loadAccountTransactions, SourceTransactionEntry } from './loadCsvTransactions';
import { loadYnabTransactionsByAccount } from './loadYnabTransactions';
import { similarity as ratcliff_similarity } from 'talisman/metrics/ratcliff-obershelp';
import { BANK_IGNORE_LIST } from './constants';

const ynabCheckingTransactions = await loadYnabTransactionsByAccount('checking');

const bankCheckingTransactions = loadAccountTransactions('checking');
const matchedYnabTransactions = new Map<string, ynab.TransactionSummary>();

const remainingYnabTransactions = [...ynabCheckingTransactions];

const transactionStatuses = bankCheckingTransactions.map((source) =>
    findSourceTransactionInYnab(source, remainingYnabTransactions),
);

const notFound = transactionStatuses.filter((status) => status.status === 'Not Found');
const foundButUncleared = transactionStatuses.filter((status) => status.status === 'Found but uncleared');
const foundButDissimilarDate = transactionStatuses.filter((status) => status.status === 'Found, but dissimilar date');

console.log(remainingYnabTransactions);
console.log(notFound);
console.log(foundButUncleared);
console.log(foundButDissimilarDate);

// The state of a source transaction relative to YNAB.

const SOURCE_TRANSACTION_STATUSES = [
    'Found',
    'Ignored',
    'Found but uncleared',
    'Found but unapproved',
    'Found, but dissimilar date',
    'Not Found',
] as const;
type SourceTransactionStatus = (typeof SOURCE_TRANSACTION_STATUSES)[number];

function findSourceTransactionInYnab(source: SourceTransactionEntry, ynabTransactions: ynab.TransactionSummary[]) {
    function makeResponse(status: SourceTransactionStatus, match?: ynab.TransactionSummary) {
        if (match) {
            matchedYnabTransactions.set(match.id, match);

            // Remove the matched transaction from the list of transactions to check
            ynabTransactions.splice(ynabTransactions.indexOf(match), 1);
        }

        return {
            status,
            source,
            match,
        };
    }

    // If the transaction is in the ignore list, carry on, not missing
    const ignoreResult = BANK_IGNORE_LIST.find((ignore) => transactionsNumericallySimilar(ignore, source, 0));
    if (ignoreResult) {
        if (ignoreResult.matchedYnab) {
            const matched = ynabTransactions.filter((ynabTransaction) =>
                transactionsNumericallySimilar(ynabTransaction, ignoreResult.matchedYnab, 0),
            );

            if (matched.length > 0) {
                return makeResponse('Ignored', matched[0]);
            }
        } else {
            return makeResponse('Ignored');
        }
    }

    // We perform an initial filter to reduce the number of transactions we need to do work on
    const initialMatches = ynabTransactions.filter((ynabTransaction) =>
        transactionsNumericallySimilar(ynabTransaction, source),
    );

    if (initialMatches.length === 0) return makeResponse('Not Found');

    // Numerically similar, and names similar
    const similarNameMatch = initialMatches.find((ynabTransaction) => transactionNamesSimilar(source, ynabTransaction));
    if (similarNameMatch) return makeResponse('Found', similarNameMatch);

    // We have numerical matches, but not any name matches
    // This can be because there really is no match, or the name is different
    // What we can do now is narrow down the search by reversing the search
    // And filtering out all of the YNAB transactions that have a source match
    const unMatched = initialMatches.filter(
        (ynabTransaction) => findSourceTransaction(ynabTransaction, bankCheckingTransactions).length === 0,
    );

    // If all of the initial matches have a source match, then we can be confident that this is a missing transaction
    if (unMatched.length === 0) return makeResponse('Not Found');

    // If there is only 1 possible match left, this could be a mismatched-name, but the same transaction
    // If the YNAB transaction is cleared and approved, of the same date & amount, then we can be confident that this is not a missing transaction
    if (unMatched.length === 1) {
        const strictlySimilar = transactionsNumericallySimilar(source, unMatched[0], 0);
        const looselySimilar = transactionsNumericallySimilar(source, unMatched[0]);
        const cleared = unMatched[0].cleared === 'cleared';
        const approved = unMatched[0].approved === true;

        if (strictlySimilar && cleared && approved) {
            return makeResponse('Found', unMatched[0]);
        }

        if (strictlySimilar && !cleared) {
            console.warn('Strictly similar, but uncleared', source, unMatched[0]);
            return makeResponse('Found but uncleared', unMatched[0]);
        }

        if (strictlySimilar && !approved) {
            console.warn('Strictly similar, but not approved', source, unMatched[0]);
            return makeResponse('Found but unapproved', unMatched[0]);
        }

        if (!strictlySimilar && looselySimilar) {
            console.warn('Loosely similar, indeterminate match', source, unMatched[0]);
            return makeResponse('Found, but dissimilar date', unMatched[0]);
        }
    }

    // unknown
    debugger;

    throw new Error('Unknown state');

    return makeResponse('Not Found');
}

function findSourceTransaction(ynabTransaction: ynab.TransactionSummary, sourceTransactions: SourceTransactionEntry[]) {
    return sourceTransactions.filter((source) => {
        const numericallySimilar = transactionsNumericallySimilar(source, ynabTransaction);
        const namesSimilar = transactionNamesSimilar(source, ynabTransaction);

        return numericallySimilar && namesSimilar;
    });
}

type TransactionComparator = {
    date: string;
    amount: number;
};

/** Are the transactions  of the same value, and nearby date-wise
 *
 * @param principal The transaction we are evaluating with
 * @param comparison The transaction we are comparing to, this transaction is the one we are trying to determine if it is similar to the principal
 * @param dayVariance The number of days before and after the principal transaction date to search for a match,
 * @returns
 */
function transactionsNumericallySimilar(
    principal: TransactionComparator,
    comparison: TransactionComparator,
    dayVariance: number = 8,
) {
    const principalMinDate = dayjs(principal.date).subtract(dayVariance, 'day');
    const principalMaxDate = dayjs(principal.date).add(dayVariance, 'day');
    const comparisonDate = dayjs(comparison.date);

    // Early exit on exact match
    if (principal.amount === comparison.amount && principal.date === comparison.date) return true;

    return (
        principal.amount === comparison.amount &&
        comparisonDate.isAfter(principalMinDate) &&
        comparisonDate.isBefore(principalMaxDate)
    );
}

/** Are the names teh same, or at least relatively close to each other */
function transactionNamesSimilar(source: SourceTransactionEntry, ynabTransaction: ynab.TransactionSummary) {
    const MIN_SIMILARITY = 0.85;
    const MIN_SAME_DAY_SIMILARITY = 0.7;
    const MIN_CHECK_SIMILARITY = 0.5;
    if (!ynabTransaction.import_payee_name_original) {
        ynabTransaction.import_payee_name_original = '';
    }

    const ynabNameNormalized = ynabTransaction.import_payee_name_original.toUpperCase();
    const sourceNameNormalized = source.name.toUpperCase();

    // Early exit on exact match
    if (ynabNameNormalized === sourceNameNormalized) return true;

    const similarity = ratcliff_similarity(ynabNameNormalized, sourceNameNormalized) as number;

    let minSimilarity = MIN_SIMILARITY;

    // Same day, we can accept a lower similarity
    if (source.date === ynabTransaction.date) {
        minSimilarity = MIN_SAME_DAY_SIMILARITY;

        // They both are check related, the check# can lower similarity a low, we can accept even lower
        if (ynabNameNormalized.startsWith('CHECK') && sourceNameNormalized.startsWith('CHECK')) {
            minSimilarity = MIN_CHECK_SIMILARITY;
        }
    }

    return similarity >= minSimilarity;
}
