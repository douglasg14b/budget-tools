import type { CategorizationQueueItemDto } from '@budget-tools/web-sdk';

export type DecisionAction = 'approved' | 'rejected' | 'changed';

export type SessionDecision = {
    readonly action: DecisionAction;
    readonly categoryGroup: string | null;
    readonly categoryId: string | null;
    readonly categoryName: string | null;
    readonly transactionId: string;
};

export type SessionDecisions = {
    readonly byId: Readonly<Record<string, SessionDecision>>;
    readonly undoStack: readonly string[];
};

export function emptySession(): SessionDecisions {
    return { byId: {}, undoStack: [] };
}

export function applyDecision(session: SessionDecisions, decision: SessionDecision): SessionDecisions {
    const alreadyDecided = Boolean(session.byId[decision.transactionId]);
    return {
        byId: { ...session.byId, [decision.transactionId]: decision },
        undoStack: alreadyDecided ? session.undoStack : [...session.undoStack, decision.transactionId],
    };
}

export function undoLast(session: SessionDecisions): SessionDecisions {
    const transactionId = session.undoStack.at(-1);
    if (!transactionId) {
        return session;
    }

    const nextById = { ...session.byId };
    delete nextById[transactionId];
    return {
        byId: nextById,
        undoStack: session.undoStack.slice(0, -1),
    };
}

export function remainingItems(
    items: readonly CategorizationQueueItemDto[],
    session: SessionDecisions,
): CategorizationQueueItemDto[] {
    return items.filter((item) => !session.byId[item.transaction.id]);
}

function hasTransaction(items: readonly CategorizationQueueItemDto[], transactionId: string | undefined): boolean {
    return Boolean(transactionId && items.some((item) => item.transaction.id === transactionId));
}

/**
 * Focus after items change. Keeps an in-list currentId even when the URL still
 * has a stale id (click/j/k write the param asynchronously).
 */
export function resolveClassifyFocus(input: {
    readonly items: readonly CategorizationQueueItemDto[];
    readonly currentId: string | undefined;
    readonly requestedId: string | undefined;
    readonly session: SessionDecisions;
}): string | undefined {
    const { items, currentId, requestedId, session } = input;
    if (hasTransaction(items, currentId)) {
        return currentId;
    }
    if (items.length === 0) {
        return currentId ?? requestedId;
    }
    if (hasTransaction(items, requestedId)) {
        return requestedId;
    }
    if (requestedId && currentId === requestedId) {
        return currentId;
    }
    const leftover = remainingItems(items, session);
    return leftover[0]?.transaction.id ?? items[0]?.transaction.id;
}

export function nextRemainingId(
    items: readonly CategorizationQueueItemDto[],
    session: SessionDecisions,
    currentId: string | undefined,
): string | undefined {
    const remaining = remainingItems(items, session);
    if (remaining.length === 0) {
        return undefined;
    }

    const currentIndex = items.findIndex((item) => item.transaction.id === currentId);
    if (currentIndex === -1) {
        return remaining[0]?.transaction.id;
    }

    for (let offset = 1; offset < items.length - currentIndex; offset += 1) {
        const candidate = items[currentIndex + offset];
        if (!session.byId[candidate.transaction.id]) {
            return candidate.transaction.id;
        }
    }

    return undefined;
}

export function previousRemainingId(
    items: readonly CategorizationQueueItemDto[],
    session: SessionDecisions,
    currentId: string | undefined,
): string | undefined {
    const remaining = remainingItems(items, session);
    if (remaining.length === 0) {
        return undefined;
    }

    const currentIndex = items.findIndex((item) => item.transaction.id === currentId);
    if (currentIndex === -1) {
        return remaining[remaining.length - 1]?.transaction.id;
    }

    for (let offset = 1; offset <= currentIndex; offset += 1) {
        const candidate = items[currentIndex - offset];
        if (!session.byId[candidate.transaction.id]) {
            return candidate.transaction.id;
        }
    }

    return undefined;
}

/**
 * Adjacent row in display order. Does not wrap or skip decided items.
 */
export function nextRowId(
    items: readonly CategorizationQueueItemDto[],
    currentId: string | undefined,
): string | undefined {
    const currentIndex = items.findIndex((item) => item.transaction.id === currentId);
    if (currentIndex === -1) {
        return items[0]?.transaction.id;
    }
    return items[currentIndex + 1]?.transaction.id;
}

export function previousRowId(
    items: readonly CategorizationQueueItemDto[],
    currentId: string | undefined,
): string | undefined {
    const currentIndex = items.findIndex((item) => item.transaction.id === currentId);
    if (currentIndex === -1) {
        return items[items.length - 1]?.transaction.id;
    }
    if (currentIndex <= 0) {
        return undefined;
    }
    return items[currentIndex - 1]?.transaction.id;
}

export type SessionTally = {
    readonly accepted: number;
    readonly changed: number;
    readonly decided: number;
    readonly rejected: number;
    readonly remaining: number;
};

export function tallySession(items: readonly CategorizationQueueItemDto[], session: SessionDecisions): SessionTally {
    let accepted = 0;
    let changed = 0;
    let rejected = 0;
    for (const item of items) {
        const decision = session.byId[item.transaction.id];
        if (!decision) {
            continue;
        }
        switch (decision.action) {
            case 'approved':
                accepted += 1;
                break;
            case 'changed':
                changed += 1;
                break;
            case 'rejected':
                rejected += 1;
                break;
        }
    }

    const decided = accepted + changed + rejected;
    return {
        accepted,
        changed,
        decided,
        rejected,
        remaining: items.length - decided,
    };
}

export function approveSuggestion(item: CategorizationQueueItemDto): SessionDecision | undefined {
    const { proposal, transaction } = item;
    if (!proposal.suggestedCategory) {
        return undefined;
    }

    return {
        action: 'approved',
        categoryGroup: proposal.suggestedCategoryGroup,
        categoryId: proposal.suggestedCategoryId,
        categoryName: proposal.suggestedCategory,
        transactionId: transaction.id,
    };
}

export function rejectItem(item: CategorizationQueueItemDto): SessionDecision {
    return {
        action: 'rejected',
        categoryGroup: null,
        categoryId: null,
        categoryName: null,
        transactionId: item.transaction.id,
    };
}

export function decideCategory(
    item: CategorizationQueueItemDto,
    choice: { categoryGroup: string | null; categoryId: string | null; categoryName: string },
): SessionDecision {
    const suggestedId = item.proposal.suggestedCategoryId;
    const suggestedName = item.proposal.suggestedCategory;
    const sameId = Boolean(choice.categoryId) && choice.categoryId === suggestedId;
    const sameName =
        !choice.categoryId &&
        suggestedName != null &&
        suggestedName.localeCompare(choice.categoryName, undefined, { sensitivity: 'accent' }) === 0;

    return {
        action: sameId || sameName ? 'approved' : 'changed',
        categoryGroup: choice.categoryGroup,
        categoryId: choice.categoryId,
        categoryName: choice.categoryName,
        transactionId: item.transaction.id,
    };
}
