import type { AppDatabaseClient } from '../../data-persistence/database';
import { listCategories } from '../categories/listCategories';
import { QueryValidationError } from '../categorization/filterQueue';
import { listTransactionsByIds } from '../categorization/listTransactionsByIds';
import { requireLiveMode } from '../operatingMode/data/operatingModeRepo';
import { NotFoundError } from '../travelWindows/HttpError';
import { assignableCategoryIds } from './assignableCategoryIds';
import { parseClassificationDecision, validateClassificationDecision } from './classificationDecision';
import { countClassificationSyncByStatus, enqueueClassificationDecision } from './data/classificationSyncRepo';
import { requestOutboundFlushIfDue } from './flush/flushOutboundSync';
import type { ClassificationDecisionDto, ClassificationDecisionsResponseDto } from './ynabSyncDtos';

export type RecordDecisionsContext = {
    readonly db?: AppDatabaseClient;
    readonly requireLive?: (db?: AppDatabaseClient) => Promise<void>;
    readonly loadTransactions?: (ids: readonly string[]) => Promise<Array<{ id: string; amount: number }>>;
    readonly loadAssignableCategoryIds?: () => Promise<ReadonlySet<string>>;
    readonly onEnqueued?: (pendingCount: number) => void;
};

/**
 * Persists live classification decisions to SQLite. Does not call YNAB.
 */
export async function recordDecisions(
    decisions: readonly ClassificationDecisionDto[],
    context: RecordDecisionsContext = {},
): Promise<ClassificationDecisionsResponseDto> {
    if (decisions.length === 0) {
        throw new QueryValidationError('decisions must not be empty');
    }

    const database = context.db;
    await (context.requireLive ?? requireLiveMode)(database);

    const parsed = decisions.map((decision) => ({
        transactionId: decision.transactionId.trim(),
        decision: parseClassificationDecision(decision),
    }));

    const ids = parsed.map((item) => item.transactionId);
    const uniqueIds = new Set(ids);
    if (uniqueIds.size !== ids.length) {
        throw new QueryValidationError('decisions cannot include the same transactionId twice');
    }

    const transactions = await (context.loadTransactions ?? listTransactionsByIds)(ids);
    const transactionsById = new Map(transactions.map((transaction) => [transaction.id, transaction]));
    for (const transactionId of ids) {
        if (!transactionsById.has(transactionId)) {
            throw new NotFoundError(`transaction ${transactionId} was not found`);
        }
    }

    const categoryIds = (await context.loadAssignableCategoryIds?.()) ?? assignableCategoryIds(await listCategories());
    for (const item of parsed) {
        const transaction = transactionsById.get(item.transactionId);
        if (!transaction) {
            throw new NotFoundError(`transaction ${item.transactionId} was not found`);
        }
        validateClassificationDecision(item.decision, transaction.amount, categoryIds);
    }

    for (const item of parsed) {
        await enqueueClassificationDecision(item.transactionId, item.decision, database);
    }

    const counts = await countClassificationSyncByStatus(database);
    const onEnqueued = context.onEnqueued ?? requestOutboundFlushIfDue;
    onEnqueued(counts.pending);
    return { accepted: parsed.length, pendingCount: counts.pending };
}
