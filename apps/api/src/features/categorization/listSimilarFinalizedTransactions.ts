import { sql } from 'kysely';

import { getDatabase } from '../../data/database';
import { logLlmSuggest } from './llm/logLlmSuggest';
import { formatTransactionDate } from './mapTransactionDetail';
import { nameSimilarity } from './nameSimilarity';
import type {
    CurrentTransactionIdentity,
    RankedSimilarTransaction,
    SimilarFinalizedTransaction,
} from './pickSimilarTransactions';
import { pickSimilarTransactions, SIMILAR_TRANSACTION_CAP } from './pickSimilarTransactions';

const EXACT_CANDIDATE_LIMIT = 40;
const FUZZY_POOL_LIMIT = 80;
const FUZZY_LOOKBACK_MONTHS = 24;
const FUZZY_AMOUNT_RELATIVE = 0.15;

type SimilarRow = {
    id: string;
    date: Date | string;
    amount: number;
    account_id: string;
    payee_id: string | null;
    payee_name: string | null;
    import_payee_name_original: string | null;
    memo: string | null;
    category_name: string | null;
    category_group: string;
};

/**
 * Finalized, labeled transactions similar to `current`, newest first, capped at 8.
 */
export async function listSimilarFinalizedTransactions(
    current: CurrentTransactionIdentity,
): Promise<RankedSimilarTransaction[]> {
    const database = getDatabase();
    const exactRows = await finalizedQuery(database)
        .where('t.id', '!=', current.id)
        .where((builder) => {
            const importOriginal = current.importPayeeNameOriginal?.trim();
            const payeeName = current.payeeName?.trim();
            const clauses = [
                ...(current.payeeId ? [builder('t.payee_id', '=', current.payeeId)] : []),
                ...(importOriginal
                    ? [sql<boolean>`lower(btrim(t.import_payee_name_original)) = ${importOriginal.toLowerCase()}`]
                    : []),
                ...(payeeName ? [sql<boolean>`lower(btrim(t.payee_name)) = ${payeeName.toLowerCase()}`] : []),
            ];
            if (clauses.length === 0) {
                return sql<boolean>`false`;
            }
            return builder.or(clauses);
        })
        .orderBy('t.date', 'desc')
        .orderBy('t.id', 'desc')
        .limit(EXACT_CANDIDATE_LIMIT)
        .execute();

    const exactCandidates = exactRows.flatMap(toSimilar);
    const selectedIds = new Set(exactCandidates.map((row) => row.id));
    selectedIds.add(current.id);

    let fuzzyCandidates: SimilarFinalizedTransaction[] = [];
    if (exactCandidates.length < SIMILAR_TRANSACTION_CAP) {
        const lookback = new Date();
        lookback.setMonth(lookback.getMonth() - FUZZY_LOOKBACK_MONTHS);
        const amountAbs = Math.abs(current.amount);
        const amountDelta = Math.max(1000, Math.round(amountAbs * FUZZY_AMOUNT_RELATIVE));

        const fuzzyRows = await finalizedQuery(database)
            .where('t.id', '!=', current.id)
            .where('t.date', '>=', lookback)
            .where((builder) =>
                builder.or([
                    builder('t.account_id', '=', current.accountId),
                    sql<boolean>`abs(t.amount - ${current.amount}) <= ${amountDelta}`,
                ]),
            )
            .orderBy('t.date', 'desc')
            .orderBy('t.id', 'desc')
            .limit(FUZZY_POOL_LIMIT)
            .execute();

        fuzzyCandidates = fuzzyRows.flatMap(toSimilar).filter((row) => !selectedIds.has(row.id));
    }

    const selected = pickSimilarTransactions({
        current,
        exactCandidates,
        fuzzyCandidates,
        nameSimilarity,
        cap: SIMILAR_TRANSACTION_CAP,
    });

    logLlmSuggest('similar transactions', {
        categoryHistogram: similarCategoryHistogram(selected),
        exactCandidateCount: exactCandidates.length,
        fuzzyCandidateCount: fuzzyCandidates.length,
        selectedCount: selected.length,
        selected: selected.map((row) => ({
            category: `${row.categoryName} | ${row.categoryGroup}`,
            date: row.date,
            importOriginal: row.importPayeeNameOriginal,
            payee: row.payeeName,
            reason: row.reason,
        })),
        transactionId: current.id,
    });

    return selected;
}

function finalizedQuery(database: ReturnType<typeof getDatabase>) {
    return database
        .selectFrom('transactions as t')
        .innerJoin('categories as c', 'c.id', 't.category_id')
        .innerJoin('category_groups as g', 'g.id', 'c.category_group_id')
        .select([
            't.id',
            't.date',
            't.amount',
            't.account_id',
            't.payee_id',
            't.payee_name',
            't.import_payee_name_original',
            't.memo',
            't.category_name',
            'g.name as category_group',
        ])
        .where('t.deleted', '=', false)
        .where('t.transfer_account_id', 'is', null)
        .where('t.cleared', 'in', ['cleared', 'reconciled'])
        .where('t.approved', '=', true)
        .where('t.category_id', 'is not', null)
        .where('c.deleted', '=', false)
        .where('g.deleted', '=', false)
        .where(sql<boolean>`jsonb_typeof(t.subtransactions) = 'array' and jsonb_array_length(t.subtransactions) = 0`)
        .where(sql<boolean>`coalesce(btrim(t.category_name), '') <> ''`)
        .where(sql<boolean>`lower(t.category_name) <> 'uncategorized'`)
        .where(sql<boolean>`lower(t.category_name) not like 'inflow:%'`)
        .where(sql<boolean>`lower(g.name) <> 'internal master category'`);
}

function similarCategoryHistogram(rows: readonly RankedSimilarTransaction[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const row of rows) {
        const key = `${row.categoryName} | ${row.categoryGroup}`;
        counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
}

function toSimilar(row: SimilarRow): SimilarFinalizedTransaction[] {
    if (!row.category_name?.trim()) {
        return [];
    }
    return [
        {
            id: row.id,
            date: formatTransactionDate(row.date),
            amount: row.amount,
            accountId: row.account_id,
            payeeId: row.payee_id,
            payeeName: row.payee_name,
            importPayeeNameOriginal: row.import_payee_name_original,
            memo: row.memo,
            categoryName: row.category_name,
            categoryGroup: row.category_group,
        },
    ];
}
