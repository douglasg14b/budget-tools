import type { CategorizationQueueItemDto, CategoryGroupDto } from '@budget-tools/web-sdk';
import { useEffect, useRef } from 'react';

import { shouldPrefetchMore, shouldPrefetchNewer } from '../shouldPrefetchMore';
import { nextUncertainRemaining } from './applyLlmOverlay';
import { ClassifyFilmstrip } from './ClassifyFilmstrip';
import { ClassifyProgress } from './ClassifyProgress';
import { ClassifyShortcuts } from './ClassifyShortcuts';
import { ClassifyStage } from './ClassifyStage';
import classes from './ClassifyWorkspace.module.css';
import { remainingItems } from './sessionDecisions';
import { useClassifySession } from './useClassifySession';
import { useLlmOverlay } from './useLlmOverlay';

type ClassifyWorkspaceProps = {
    categoryGroups: readonly CategoryGroupDto[];
    hasMoreNewer: boolean;
    hasMoreOlder: boolean;
    isExpandingNewer: boolean;
    isExpandingOlder: boolean;
    items: readonly CategorizationQueueItemDto[];
    onNeedNewer: () => void;
    onNeedOlder: () => void;
    onCurrentIdChange?: (transactionId: string | undefined) => void;
    requestedId?: string;
};

export function ClassifyWorkspace({
    categoryGroups,
    hasMoreNewer,
    hasMoreOlder,
    isExpandingNewer,
    isExpandingOlder,
    items,
    onCurrentIdChange,
    onNeedNewer,
    onNeedOlder,
    requestedId,
}: ClassifyWorkspaceProps) {
    const displayedItemRef = useRef<CategorizationQueueItemDto | undefined>(undefined);
    const classify = useClassifySession(items, categoryGroups, {
        displayedItemRef,
        navigate: 'remaining',
        onCurrentIdChange,
        requestedId,
    });
    const current = classify.current;
    const remaining = remainingItems(items, classify.session);
    const overlay = useLlmOverlay({
        current,
        currentDecided: Boolean(current && classify.session.byId[current.transaction.id]),
        next: nextUncertainRemaining(remaining, current?.transaction.id),
    });
    const displayItem = overlay.item ?? current;
    displayedItemRef.current = displayItem;

    useEffect(() => {
        if (shouldPrefetchMore(classify.position, items.length, hasMoreOlder)) {
            onNeedOlder();
        }
        if (shouldPrefetchNewer(classify.position, hasMoreNewer)) {
            onNeedNewer();
        }
    }, [classify.position, hasMoreNewer, hasMoreOlder, items.length, onNeedNewer, onNeedOlder]);

    if (!current || !displayItem) {
        return null;
    }

    const currentId = current.transaction.id;

    return (
        <div className={classes.workspace}>
            <ClassifyProgress
                certainCount={classify.certainRemaining.length}
                completeHint="Batch reviewed. Select any row to edit, or undo."
                hasMore={hasMoreOlder}
                isExpanding={isExpandingOlder}
                itemCount={items.length}
                onAcceptAllCertain={classify.acceptAllCertain}
                position={classify.position}
                tally={classify.tally}
            />
            <ClassifyFilmstrip
                currentId={currentId}
                hasMoreNewer={hasMoreNewer}
                hasMoreOlder={hasMoreOlder}
                isExpandingNewer={isExpandingNewer}
                isExpandingOlder={isExpandingOlder}
                items={items}
                session={classify.session}
                onNeedNewer={onNeedNewer}
                onNeedOlder={onNeedOlder}
                onSelect={classify.setCurrentId}
            />
            <ClassifyStage
                categoryGroups={classify.selectGroups}
                choicesById={classify.choicesById}
                decision={classify.session.byId[currentId]}
                item={displayItem}
                llmAsking={overlay.isPending}
                llmError={overlay.errorMessage}
                payee={classify.payeeName(displayItem)}
                rename={classify.payeeRename(displayItem)}
                onAccept={classify.acceptCurrent}
                onCommitPayee={(name) => {
                    classify.commitPayee(currentId, name);
                }}
                onDismissRename={() => {
                    classify.dismissRename(currentId);
                }}
                onPickCategoryId={classify.pickCategoryId}
                onPickOption={classify.pickOption}
                onReject={classify.rejectCurrent}
                onUndo={classify.undo}
            />
            <div className={classes.shortcuts}>
                <ClassifyShortcuts certainAvailable={classify.certainRemaining.length > 0} />
            </div>
        </div>
    );
}
