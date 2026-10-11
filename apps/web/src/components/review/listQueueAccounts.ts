import type { CategorizationQueueItemDto } from '@budget-tools/web-sdk';

import type { AccountOption } from './QueueFilters';

/** Distinct accounts among queue rows, sorted by name, for the account filter. */
export function listQueueAccounts(items: readonly CategorizationQueueItemDto[]): AccountOption[] {
    const namesById = new Map<string, string>();
    for (const item of items) {
        if (!namesById.has(item.transaction.accountId)) {
            namesById.set(item.transaction.accountId, item.transaction.accountName);
        }
    }

    return [...namesById.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((left, right) => left.name.localeCompare(right.name));
}
