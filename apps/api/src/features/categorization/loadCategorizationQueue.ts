import { getDatabase } from '../../data/database';
import {
    CATEGORIZATION_AI_WORKING_DIR,
    CATEGORIZATION_LLM_ENABLED,
    CATEGORIZATION_MODELS_DIR,
    CATEGORIZATION_PREDICT_TIMEOUT_MS,
    getDbConnectionString,
} from '../../environment';
import type {
    CategorizationProposalDto,
    CategorizationQueueDto,
    CategorizationQueueItemDto,
    CategorizationQueueQuery,
    QueueSummaryDto,
    TransactionDetailDto,
} from './categorizationDtos';
import { filterAndSortQueueItems, parseTierFilter } from './filterQueue';
import { runPredictJson } from './predictJson';

type CachedQueue = {
    generatedAt: string;
    llm: boolean;
    summary: QueueSummaryDto;
    proposals: CategorizationProposalDto[];
};

const cache = new Map<boolean, CachedQueue>();
const inFlight = new Map<boolean, Promise<CachedQueue>>();

/**
 * Returns the review queue: cached (or freshly spawned) proposals joined to Postgres transactions.
 */
export async function loadCategorizationQueue(query: CategorizationQueueQuery): Promise<CategorizationQueueDto> {
    const llm = query.llm ?? CATEGORIZATION_LLM_ENABLED;
    const refresh = query.refresh === true;
    const cached = await getCachedQueue(llm, refresh);
    const items = await joinTransactions(cached.proposals);
    const filteredItems = filterAndSortQueueItems(items, {
        tiers: parseTierFilter(query.tier),
        accountId: query.accountId,
    });

    return {
        summary: cached.summary,
        generatedAt: cached.generatedAt,
        llm: cached.llm,
        items: filteredItems,
    };
}

async function getCachedQueue(llm: boolean, refresh: boolean): Promise<CachedQueue> {
    if (!refresh) {
        const hit = cache.get(llm);
        if (hit) {
            return hit;
        }
    }

    const pending = inFlight.get(llm);
    if (pending) {
        return pending;
    }

    const promise = loadQueueFromCli(llm);
    inFlight.set(llm, promise);
    try {
        const result = await promise;
        cache.set(llm, result);
        return result;
    } finally {
        if (inFlight.get(llm) === promise) {
            inFlight.delete(llm);
        }
    }
}

async function loadQueueFromCli(llm: boolean): Promise<CachedQueue> {
    const envelope = await runPredictJson({
        workingDir: CATEGORIZATION_AI_WORKING_DIR,
        modelsDir: CATEGORIZATION_MODELS_DIR,
        connectionString: getDbConnectionString(),
        timeoutMs: CATEGORIZATION_PREDICT_TIMEOUT_MS,
        llm,
    });

    return {
        generatedAt: new Date().toISOString(),
        llm,
        summary: envelope.summary,
        proposals: envelope.proposals,
    };
}

async function joinTransactions(proposals: CategorizationProposalDto[]): Promise<CategorizationQueueItemDto[]> {
    if (proposals.length === 0) {
        return [];
    }

    const transactionIds = proposals.map((proposal) => proposal.transactionId);
    const rows = await getDatabase()
        .selectFrom('transactions')
        .select([
            'id',
            'date',
            'amount',
            'memo',
            'cleared',
            'approved',
            'account_id',
            'account_name',
            'payee_id',
            'payee_name',
            'category_id',
            'category_name',
            'import_id',
            'import_payee_name',
        ])
        .where('id', 'in', transactionIds)
        .execute();

    const transactionsById = new Map(rows.map((row) => [row.id, toTransactionDetail(row)]));

    const items: CategorizationQueueItemDto[] = [];
    for (const proposal of proposals) {
        const transaction = transactionsById.get(proposal.transactionId);
        if (!transaction) {
            continue;
        }
        items.push({ transaction, proposal });
    }

    return items;
}

type TransactionRow = {
    id: string;
    date: Date | string;
    amount: number;
    memo: string | null;
    cleared: string;
    approved: boolean;
    account_id: string;
    account_name: string;
    payee_id: string | null;
    payee_name: string | null;
    category_id: string | null;
    category_name: string | null;
    import_id: string | null;
    import_payee_name: string | null;
};

function toTransactionDetail(row: TransactionRow): TransactionDetailDto {
    return {
        id: row.id,
        date: formatTransactionDate(row.date),
        amount: row.amount,
        memo: row.memo,
        cleared: row.cleared,
        approved: row.approved,
        accountId: row.account_id,
        accountName: row.account_name,
        payeeId: row.payee_id,
        payeeName: row.payee_name,
        categoryId: row.category_id,
        categoryName: row.category_name,
        importId: row.import_id,
        importPayeeName: row.import_payee_name,
    };
}

function formatTransactionDate(value: Date | string): string {
    if (typeof value === 'string') {
        return value.slice(0, 10);
    }
    return value.toISOString().slice(0, 10);
}
