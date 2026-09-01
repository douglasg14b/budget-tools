import type { CategorizationQueueItemDto, CategoryGroupDto } from '@budget-tools/web-sdk';
import { useEffect, useRef } from 'react';

import { BackendErrorNotice } from '../../BackendErrorNotice';
import { shouldPrefetchMore, shouldPrefetchNewer } from '../shouldPrefetchMore';
import {
    canCaptureReceipt,
    selectAmazonPrefetchNeighbors,
    selectLlmPrefetchNeighbors,
    selectReceiptPrefetchNeighbors,
} from './applyLlmOverlay';
import { ClassifyFilmstrip } from './ClassifyFilmstrip';
import { ClassifyProgress } from './ClassifyProgress';
import { ClassifyShortcuts } from './ClassifyShortcuts';
import { ClassifyStage } from './ClassifyStage';
import classes from './ClassifyWorkspace.module.css';
import { isAmazonTransaction } from './isAmazonTransaction';
import { usePracticeReceipts } from './PracticeReceiptsContext';
import { remainingItems } from './sessionDecisions';
import { splitLinesFromReceiptDraft } from './splitLines';
import { useAmazonSplitOverlay } from './useAmazonSplitOverlay';
import { useClassifySession } from './useClassifySession';
import type { LiveClassification } from './useLiveClassification';
import { useLlmOverlay } from './useLlmOverlay';
import { usePredictWindow } from './usePredictWindow';
import { useReceiptCapture } from './useReceiptCapture';
import { useReceiptOverlay } from './useReceiptOverlay';

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
    const { receipts: sessionReceipts, setReceipts: setSessionReceipts } = usePracticeReceipts();
    const displayedItemRef = useRef<CategorizationQueueItemDto | undefined>(undefined);
    const amazonDismissedRef = useRef(new Set<string>());
    const receiptDismissedRef = useRef(new Set<string>());
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
    const isLive = Boolean(live);
    const receiptPrefetch = selectReceiptPrefetchNeighbors(remaining, current?.transaction.id);
    const receipt = useReceiptOverlay({
        current,
        currentDecided,
        prefetchPrevious: receiptPrefetch.previous,
        prefetchNext: receiptPrefetch.next,
        live: isLive,
        sessionReceipts,
    });
    const overlay = useLlmOverlay({
        current,
        currentDecided,
        prefetchPrevious: llmPrefetch.previous,
        prefetchNext: llmPrefetch.next,
        receiptSkip: receipt.llmSkip,
    });
    const amazonPrefetch = selectAmazonPrefetchNeighbors(remaining, current?.transaction.id);
    const amazon = useAmazonSplitOverlay({
        current,
        currentDecided,
        prefetchPrevious: amazonPrefetch.previous,
        prefetchNext: amazonPrefetch.next,
    });
    const capture = useReceiptCapture({
        live: isLive,
        transactionId: current?.transaction.id ?? null,
        onPracticeReceipt: (row) => {
            setSessionReceipts((previous) => [
                ...previous.filter((existing) => existing.transactionId !== row.transactionId),
                row,
            ]);
        },
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
        const draft = receipt.splitDraft;
        const transactionId = current?.transaction.id;
        if (!current || !draft || draft.kind !== 'split' || !transactionId) {
            return;
        }
        if (isAmazonTransaction(current.transaction)) {
            return;
        }
        if (amazon.overlay?.lines.length) {
            return;
        }
        if (splitDraft || currentDecided || receiptDismissedRef.current.has(transactionId)) {
            return;
        }
        beginSplitRef.current(current, splitLinesFromReceiptDraft(draft.lines));
    }, [amazon.overlay, current, currentDecided, receipt.splitDraft, splitDraft]);

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
                canGoNext={classify.canGoNext}
                canGoPrevious={classify.canGoPrevious}
                certainCount={classify.certainRemaining.length}
                completeHint="Batch reviewed. Undo to go back."
                hasMore={hasMoreOlder}
                isExpanding={isExpandingOlder}
                itemCount={items.length}
                onAcceptAllCertain={classify.acceptAllCertain}
                onNext={classify.goNext}
                onPrevious={classify.goPrevious}
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
                receipt={
                    isAmazonTransaction(displayItem.transaction)
                        ? undefined
                        : {
                              overlay: receipt.overlay,
                              asking: receipt.isPending,
                              error: receipt.errorMessage,
                              capture: canCaptureReceipt(displayItem) ? capture : null,
                          }
                }
                onAccept={classify.acceptCurrent}
                onBeginSplit={() => {
                    amazonDismissedRef.current.delete(currentId);
                    receiptDismissedRef.current.delete(currentId);
                    classify.beginSplit(displayItem);
                }}
                onCancelSplit={() => {
                    amazonDismissedRef.current.add(currentId);
                    receiptDismissedRef.current.add(currentId);
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
