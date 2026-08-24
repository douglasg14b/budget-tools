import type {
    CategorizationQueueItemDto,
    CategoryGroupDto,
    CategoryOptionDto,
    PayeeSuggestionDto,
} from '@budget-tools/web-sdk';
import { useHotkeys } from '@mantine/hooks';
import type { MutableRefObject } from 'react';
import { useEffect, useMemo, useState } from 'react';

import { ALTERNATIVE_SHORTCUT_COUNT, alternativeOptions } from './alternativeOptions';
import { CLASSIFY_DIALOG_ATTR, CLASSIFY_HOTKEYS } from './classifyKeys';
import { categorySelectGroups, choiceById, flattenCategoryChoices } from './flattenCategoryChoices';
import { isCertainProposal } from './isCertainProposal';
import type { PayeeEdits } from './payeeEdits';
import {
    dismissPayeeRename,
    displayedPayeeName,
    emptyPayeeEdits,
    setPayeeName,
    visiblePayeeRename,
} from './payeeEdits';
import type { SessionDecision } from './sessionDecisions';
import {
    applyDecision,
    approveSuggestion,
    decideCategory,
    emptySession,
    nextRemainingId,
    nextRowId,
    previousRemainingId,
    previousRowId,
    rejectItem,
    remainingItems,
    resolveClassifyFocus,
    tallySession,
    undoLast,
} from './sessionDecisions';

type UseClassifySessionOptions = {
    /**
     * When set, Accept / shortcuts use this item if it matches the focused id (LLM overlay).
     */
    displayedItemRef?: MutableRefObject<CategorizationQueueItemDto | undefined>;
    /**
     * `remaining` skips decided items (card bench). `rows` moves one visual row (table).
     * Deciding still advances to the next undecided item either way.
     */
    navigate: 'remaining' | 'rows';
    requestedId?: string;
    onCurrentIdChange?: (transactionId: string | undefined) => void;
};

export function useClassifySession(
    items: readonly CategorizationQueueItemDto[],
    categoryGroups: readonly CategoryGroupDto[],
    options: UseClassifySessionOptions,
) {
    const [session, setSession] = useState(emptySession);
    const [payeeEdits, setPayeeEdits] = useState<PayeeEdits>(emptyPayeeEdits);
    const [currentId, setCurrentId] = useState<string | undefined>(options.requestedId ?? items[0]?.transaction.id);

    const choices = useMemo(() => flattenCategoryChoices(categoryGroups), [categoryGroups]);
    const selectGroups = useMemo(() => categorySelectGroups(choices), [choices]);
    const choicesById = useMemo(() => new Map(choices.map((choice) => [choice.id, choice])), [choices]);

    const remaining = remainingItems(items, session);
    const certainRemaining = remaining.filter((item) => isCertainProposal(item.proposal));
    const tally = tallySession(items, session);
    const current = items.find((item) => item.transaction.id === currentId) ?? remaining[0] ?? items[0];
    const position = current ? items.findIndex((item) => item.transaction.id === current.transaction.id) + 1 : 0;

    useEffect(() => {
        if (options.requestedId) {
            setCurrentId(options.requestedId);
        }
    }, [options.requestedId]);

    useEffect(() => {
        const nextId = resolveClassifyFocus({
            currentId,
            items,
            requestedId: options.requestedId,
            session,
        });
        if (nextId !== currentId) {
            setCurrentId(nextId);
        }
    }, [currentId, items, options.requestedId, session]);

    useEffect(() => {
        options.onCurrentIdChange?.(currentId);
    }, [currentId, options.onCurrentIdChange]);

    function commit(decision: SessionDecision): void {
        const nextSession = applyDecision(session, decision);
        setSession(nextSession);
        setCurrentId(nextRemainingId(items, nextSession, decision.transactionId) ?? decision.transactionId);
    }

    function displayedCurrent(): CategorizationQueueItemDto | undefined {
        const overlay = options.displayedItemRef?.current;
        if (overlay && overlay.transaction.id === current?.transaction.id) {
            return overlay;
        }
        return current;
    }

    function acceptCurrent(): void {
        const item = displayedCurrent();
        if (!item) {
            return;
        }
        const decision = approveSuggestion(item);
        if (decision) {
            commit(decision);
        }
    }

    function rejectCurrent(): void {
        if (current) {
            commit(rejectItem(current));
        }
    }

    function pickOption(option: CategoryOptionDto): void {
        if (!current) {
            return;
        }
        commit(
            decideCategory(current, {
                categoryGroup: option.categoryGroup,
                categoryId: option.categoryId,
                categoryName: option.category,
            }),
        );
    }

    function pickCategoryId(categoryId: string): void {
        if (!current) {
            return;
        }
        const choice = choiceById(choices, categoryId);
        if (!choice) {
            return;
        }
        commit(
            decideCategory(current, {
                categoryGroup: choice.groupName,
                categoryId: choice.id,
                categoryName: choice.name,
            }),
        );
    }

    function undo(): void {
        const lastId = session.undoStack.at(-1);
        const nextSession = undoLast(session);
        setSession(nextSession);
        setCurrentId(lastId ?? currentId);
    }

    function acceptAllCertain(): void {
        let nextSession = session;
        let lastId = currentId;
        for (const item of certainRemaining) {
            const decision = approveSuggestion(item);
            if (!decision) {
                continue;
            }
            nextSession = applyDecision(nextSession, decision);
            lastId = item.transaction.id;
        }
        setSession(nextSession);
        setCurrentId(nextRemainingId(items, nextSession, lastId) ?? lastId);
    }

    function goNext(): void {
        const nextId =
            options.navigate === 'rows'
                ? nextRowId(items, current?.transaction.id)
                : nextRemainingId(items, session, current?.transaction.id);
        if (nextId) {
            setCurrentId(nextId);
        }
    }

    function goPrevious(): void {
        const previousId =
            options.navigate === 'rows'
                ? previousRowId(items, current?.transaction.id)
                : previousRemainingId(items, session, current?.transaction.id);
        if (previousId) {
            setCurrentId(previousId);
        }
    }

    function commitPayee(transactionId: string, name: string): void {
        setPayeeEdits((edits) => setPayeeName(edits, transactionId, name));
    }

    function dismissRename(transactionId: string): void {
        setPayeeEdits((edits) => dismissPayeeRename(edits, transactionId));
    }

    function payeeName(item: CategorizationQueueItemDto): string {
        return displayedPayeeName(item.transaction, payeeEdits);
    }

    function payeeRename(item: CategorizationQueueItemDto): PayeeSuggestionDto | null {
        return visiblePayeeRename(item.proposal, item.transaction.id, payeeName(item), payeeEdits);
    }

    const hotkeys: Array<[string, () => void]> = [
        [CLASSIFY_HOTKEYS.accept, acceptCurrent],
        [CLASSIFY_HOTKEYS.reject, rejectCurrent],
        [CLASSIFY_HOTKEYS.undo, undo],
        [CLASSIFY_HOTKEYS.acceptAllCertain, acceptAllCertain],
        [CLASSIFY_HOTKEYS.next, goNext],
        ['ArrowDown', goNext],
        [CLASSIFY_HOTKEYS.previous, goPrevious],
        ['ArrowUp', goPrevious],
    ];
    for (let index = 0; index < ALTERNATIVE_SHORTCUT_COUNT; index += 1) {
        const optionIndex = index;
        hotkeys.push([
            String(optionIndex + 1),
            () => {
                const item = displayedCurrent();
                const option = item ? alternativeOptions(item.proposal)[optionIndex] : undefined;
                if (option) {
                    pickOption(option);
                }
            },
        ]);
    }
    useHotkeys(
        hotkeys.map(([key, handler]) => [key, unlessDialogOpen(handler)]),
        ['INPUT', 'TEXTAREA', 'SELECT', 'SUMMARY'],
    );

    return {
        acceptAllCertain,
        acceptCurrent,
        certainRemaining,
        choicesById,
        commitPayee,
        current,
        dismissRename,
        payeeName,
        payeeRename,
        pickCategoryId,
        pickOption,
        position,
        rejectCurrent,
        selectGroups,
        session,
        setCurrentId,
        tally,
        undo,
    };
}

function unlessDialogOpen(handler: () => void): () => void {
    return () => {
        if (document.body.hasAttribute(CLASSIFY_DIALOG_ATTR)) {
            return;
        }
        handler();
    };
}
