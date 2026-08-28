import type { CategorizationQueueItemDto, CategoryGroupDto } from '@budget-tools/web-sdk';
import { useEffect, useRef } from 'react';

import { BackendErrorNotice } from '../../BackendErrorNotice';
import { shouldPrefetchMore, shouldPrefetchNewer } from '../shouldPrefetchMore';
import { selectAmazonPrefetchNeighbors, selectLlmPrefetchNeighbors } from './applyLlmOverlay';
import { ClassifyFilmstrip } from './ClassifyFilmstrip';
import { ClassifyProgress } from './ClassifyProgress';
import { ClassifyShortcuts } from './ClassifyShortcuts';
import { ClassifyStage } from './ClassifyStage';
import classes from './ClassifyWorkspace.module.css';
import { isAmazonTransaction } from './isAmazonTransaction';
import { remainingItems } from './sessionDecisions';
import { useAmazonSplitOverlay } from './useAmazonSplitOverlay';
import { useClassifySession } from './useClassifySession';
import type { LiveClassification } from './useLiveClassification';
import { useLlmOverlay } from './useLlmOverlay';
import { usePredictWindow } from './usePredictWindow';

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
    live?: LiveClassification;
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
    live,
}: ClassifyWorkspaceProps) {
    const displayedItemRef = useRef<CategorizationQueueItemDto | undefined>(undefined);
    const amazonDismissedRef = useRef(new Set<string>());
    const classify = useClassifySession(items, categoryGroups, {
        displayedItemRef,
        live,
        navigate: 'remaining',
        onCurrentIdChange,
        requestedId,
    });
    const current = classify.current;
    const currentDecided = Boolean(current && classify.session.byId[current.transaction.id]);
    const remaining = remainingItems(items, classify.session);
    const predict = usePredictWindow({ currentId: current?.transaction.id, items });
    const llmPrefetch = selectLlmPrefetchNeighbors(remaining, current?.transaction.id);
    const overlay = useLlmOverlay({
        current,
        currentDecided,
        prefetchPrevious: llmPrefetch.previous,
        prefetchNext: llmPrefetch.next,
    });
    const amazonPrefetch = selectAmazonPrefetchNeighbors(remaining, current?.transaction.id);
    const amazon = useAmazonSplitOverlay({
        current,
        currentDecided,
        prefetchPrevious: amazonPrefetch.previous,
        prefetchNext: amazonPrefetch.next,
    });
    const displayItem = overlay.item ?? current;
    displayedItemRef.current = displayItem;
    const beginSplitRef = useRef(classify.beginSplit);
    beginSplitRef.current = classify.beginSplit;
    const splitDraft = current ? classify.splitDrafts[current.transaction.id] : undefined;

    useEffect(() => {
        const overlayResult = amazon.overlay;
        const transactionId = current?.transaction.id;
        if (!current || !overlayResult || !transactionId || overlayResult.transactionId !== transactionId) {
            return;
        }
        if (overlayResult.lines.length === 0 || splitDraft || currentDecided) {
            return;
        }
        if (amazonDismissedRef.current.has(transactionId)) {
            return;
        }
        beginSplitRef.current(current, overlayResult.lines);
    }, [amazon.overlay, current, currentDecided, splitDraft]);

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
            {classify.liveError ? <BackendErrorNotice error={new Error(classify.liveError)} /> : null}
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
                assignableIds={classify.assignableIds}
                categoryGroups={classify.selectGroups}
                choicesById={classify.choicesById}
                decision={classify.session.byId[currentId]}
                item={displayItem}
                llmAsking={overlay.isPending}
                llmError={overlay.errorMessage}
                payee={classify.payeeName(displayItem)}
                rename={classify.payeeRename(displayItem)}
                scoreError={predict.errorMessage}
                scoring={predict.isPending && !displayItem.proposal}
                splitLines={classify.splitDrafts[currentId]}
                amazon={
                    isAmazonTransaction(displayItem.transaction)
                        ? {
                              overlay: amazon.overlay?.transactionId === currentId ? amazon.overlay : undefined,
                              asking: amazon.isPending,
                              error: amazon.errorMessage ?? amazon.syncError,
                              syncing: amazon.syncing,
                              onSync: amazon.sync,
                          }
                        : undefined
                }
                onAccept={classify.acceptCurrent}
                onBeginSplit={() => {
                    amazonDismissedRef.current.delete(currentId);
                    classify.beginSplit(displayItem);
                }}
                onCancelSplit={() => {
                    amazonDismissedRef.current.add(currentId);
                    classify.cancelSplit(currentId);
                }}
                onChangeSplit={(lines) => {
                    classify.setSplitLines(currentId, lines);
                }}
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
