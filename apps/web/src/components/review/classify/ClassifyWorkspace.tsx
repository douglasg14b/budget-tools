import type { CategorizationQueueItemDto, CategoryGroupDto } from '@budget-tools/web-sdk';
import { useEffect, useRef } from 'react';

import { shouldPrefetchMore } from '../shouldPrefetchMore';
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
    hasMore: boolean;
    isExpanding: boolean;
    items: readonly CategorizationQueueItemDto[];
    onNeedMore: () => void;
};

export function ClassifyWorkspace({ categoryGroups, hasMore, isExpanding, items, onNeedMore }: ClassifyWorkspaceProps) {
    const displayedItemRef = useRef<CategorizationQueueItemDto | undefined>(undefined);
    const classify = useClassifySession(items, categoryGroups, {
        displayedItemRef,
        navigate: 'remaining',
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
        if (shouldPrefetchMore(classify.position, items.length, hasMore)) {
            onNeedMore();
        }
    }, [classify.position, hasMore, items.length, onNeedMore]);

    if (!current || !displayItem) {
        return null;
    }

    const currentId = current.transaction.id;

    return (
        <div className={classes.workspace}>
            <ClassifyProgress
                certainCount={classify.certainRemaining.length}
                completeHint="Batch reviewed. Select any row to edit, or undo."
                hasMore={hasMore}
                isExpanding={isExpanding}
                itemCount={items.length}
                onAcceptAllCertain={classify.acceptAllCertain}
                position={classify.position}
                tally={classify.tally}
            />
            <ClassifyFilmstrip
                currentId={currentId}
                hasMore={hasMore}
                isExpanding={isExpanding}
                items={items}
                session={classify.session}
                onNeedMore={onNeedMore}
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
