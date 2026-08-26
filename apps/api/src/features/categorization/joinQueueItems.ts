import type { CategorizationProposalDto, CategorizationQueueItemDto } from './categorizationDtos';
import type { PendingTransactionRow } from './listPendingTransactions';
import { toTransactionDetail } from './listPendingTransactions';

export type JoinQueueItemsInput = {
    readonly pending: readonly PendingTransactionRow[];
    readonly proposalsById: ReadonlyMap<string, CategorizationProposalDto>;
    readonly sliceIds?: ReadonlySet<string>;
    /** When true, pending rows without a proposal are omitted. */
    readonly requireProposal: boolean;
};

/**
 * Joins pending transactions to cached proposals, optionally limited to a window of ids.
 */
export function joinQueueItems(
    input: JoinQueueItemsInput,
): Array<Omit<CategorizationQueueItemDto, 'relatedTransactions'>> {
    const items: Array<Omit<CategorizationQueueItemDto, 'relatedTransactions'>> = [];
    for (const row of input.pending) {
        if (input.sliceIds && !input.sliceIds.has(row.id)) {
            continue;
        }
        const proposal = input.proposalsById.get(row.id) ?? null;
        if (input.requireProposal && !proposal) {
            continue;
        }
        items.push({ transaction: toTransactionDetail(row), proposal });
    }
    return items;
}
