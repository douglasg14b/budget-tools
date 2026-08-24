import type {
    CategorizationQueueItemDto,
    CategoryGroupDto,
    CategoryOptionDto,
    PayeeSuggestionDto,
} from '@budget-tools/web-sdk';
import { Select, UnstyledButton } from '@mantine/core';
import type { Ref } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { TravelWindowChip } from '../FlagChips';
import { formatConfidence } from '../formatConfidence';
import { formatTransactionDate } from '../formatTransactionDate';
import { formatYnabAmount } from '../formatYnabAmount';
import { QueuePrefetchSentinel } from '../QueuePrefetchSentinel';
import { shouldPrefetchMore, shouldPrefetchNewer } from '../shouldPrefetchMore';
import { alternativeOptions } from './alternativeOptions';
import { ClassifyPayee } from './ClassifyPayee';
import { ClassifyProgress } from './ClassifyProgress';
import { ClassifyShortcuts } from './ClassifyShortcuts';
import classes from './ClassifyTable.module.css';
import type { CategorySelectGroup } from './flattenCategoryChoices';
import { formatCategoryLabel } from './formatCategoryLabel';
import { isCertainProposal } from './isCertainProposal';
import type { SessionDecision } from './sessionDecisions';
import { useClassifySession } from './useClassifySession';

type ClassifyTableProps = {
    categoryGroups: readonly CategoryGroupDto[];
    hasMoreNewer: boolean;
    hasMoreOlder: boolean;
    isExpandingNewer: boolean;
    isExpandingOlder: boolean;
    items: readonly CategorizationQueueItemDto[];
    onCurrentIdChange?: (transactionId: string | undefined) => void;
    onNeedNewer: () => void;
    onNeedOlder: () => void;
    requestedId?: string;
};

/** Table layout never requests JIT LLM overlays — that lives on the classify card. */
export function ClassifyTable({
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
}: ClassifyTableProps) {
    const classify = useClassifySession(items, categoryGroups, {
        navigate: 'rows',
        onCurrentIdChange,
        requestedId,
    });
    const currentRef = useRef<HTMLTableRowElement>(null);
    const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
    const previousFirstId = useRef<string | undefined>(undefined);
    const previousScrollHeight = useRef(0);

    useLayoutEffect(() => {
        const firstId = items[0]?.transaction.id;
        if (scroller && previousFirstId.current && firstId !== previousFirstId.current) {
            scroller.scrollTop += scroller.scrollHeight - previousScrollHeight.current;
        }
        previousFirstId.current = firstId;
        previousScrollHeight.current = scroller?.scrollHeight ?? 0;
    }, [items, scroller]);

    useEffect(() => {
        currentRef.current?.scrollIntoView({ block: 'nearest' });
    }, [classify.current?.transaction.id]);

    useEffect(() => {
        if (shouldPrefetchMore(classify.position, items.length, hasMoreOlder)) {
            onNeedOlder();
        }
        if (shouldPrefetchNewer(classify.position, hasMoreNewer)) {
            onNeedNewer();
        }
    }, [classify.position, hasMoreNewer, hasMoreOlder, items.length, onNeedNewer, onNeedOlder]);

    if (!classify.current) {
        return null;
    }

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
            <div ref={setScroller} className={classes.scroller}>
                <QueuePrefetchSentinel
                    enabled={hasMoreNewer}
                    isLoading={isExpandingNewer}
                    requireScroll
                    root={scroller}
                    onNeedMore={onNeedNewer}
                />
                <table className={classes.table}>
                    <thead>
                        <tr>
                            <th className={classes.num}>#</th>
                            <th>Date</th>
                            <th>Payee</th>
                            <th className={classes.amountHead}>Amount</th>
                            <th>Suggestion</th>
                            <th className={classes.confHead}>%</th>
                            <th>Or</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item, index) => {
                            const isCurrent = item.transaction.id === classify.current?.transaction.id;
                            return (
                                <TableRow
                                    key={item.transaction.id}
                                    categoryGroups={classify.selectGroups}
                                    currentRef={isCurrent ? currentRef : undefined}
                                    decision={classify.session.byId[item.transaction.id]}
                                    index={index + 1}
                                    isCurrent={isCurrent}
                                    item={item}
                                    payee={classify.payeeName(item)}
                                    rename={classify.payeeRename(item)}
                                    onCommitPayee={(name) => {
                                        classify.commitPayee(item.transaction.id, name);
                                    }}
                                    onDismissRename={() => {
                                        classify.dismissRename(item.transaction.id);
                                    }}
                                    onPickCategoryId={classify.pickCategoryId}
                                    onPickOption={classify.pickOption}
                                    onSelect={classify.setCurrentId}
                                />
                            );
                        })}
                    </tbody>
                </table>
                <QueuePrefetchSentinel
                    enabled={hasMoreOlder}
                    isLoading={isExpandingOlder}
                    requireScroll
                    root={scroller}
                    onNeedMore={onNeedOlder}
                />
            </div>
            <div className={classes.shortcuts}>
                <ClassifyShortcuts certainAvailable={classify.certainRemaining.length > 0} />
            </div>
        </div>
    );
}

type TableRowProps = {
    categoryGroups: readonly CategorySelectGroup[];
    currentRef: Ref<HTMLTableRowElement> | undefined;
    decision: SessionDecision | undefined;
    index: number;
    isCurrent: boolean;
    item: CategorizationQueueItemDto;
    onCommitPayee: (name: string) => void;
    onDismissRename: () => void;
    onPickCategoryId: (categoryId: string) => void;
    onPickOption: (option: CategoryOptionDto) => void;
    onSelect: (transactionId: string) => void;
    payee: string;
    rename: PayeeSuggestionDto | null;
};

function TableRow({
    categoryGroups,
    currentRef,
    decision,
    index,
    isCurrent,
    item,
    onCommitPayee,
    onDismissRename,
    onPickCategoryId,
    onPickOption,
    onSelect,
    payee,
    rename,
}: TableRowProps) {
    const { transaction, proposal } = item;
    const suggestion = formatCategoryLabel(proposal.suggestedCategory, proposal.suggestedCategoryGroup);
    const certain = isCertainProposal(proposal);
    const alternatives = alternativeOptions(proposal);

    return (
        <tr
            ref={currentRef}
            className={classes.row}
            data-action={decision?.action}
            data-current={isCurrent || undefined}
            data-travel={proposal.flags.isTravelWindow || undefined}
            onClick={() => {
                onSelect(transaction.id);
            }}
        >
            <td className={classes.num}>{index}</td>
            <td className={classes.date}>{formatTransactionDate(transaction.date)}</td>
            <td className={classes.payee}>
                <ClassifyPayee
                    payee={payee || '—'}
                    rename={rename}
                    variant="compact"
                    onCommit={onCommitPayee}
                    onDismissRename={onDismissRename}
                />
                {transaction.memo ? <span className={classes.memo}>{transaction.memo}</span> : null}
                {proposal.travelWindow ? (
                    <span className={classes.travelChip}>
                        <TravelWindowChip travelWindow={proposal.travelWindow} />
                    </span>
                ) : null}
            </td>
            <td className={classes.amount} data-inflow={transaction.amount >= 0 || undefined}>
                {formatYnabAmount(transaction.amount)}
            </td>
            <td className={suggestion ? classes.suggestion : classes.suggestionMuted}>{suggestion ?? '—'}</td>
            <td className={classes.conf} data-certain={certain || undefined}>
                {formatConfidence(proposal.confidence)}
            </td>
            <td className={classes.alts}>
                {alternatives.map((option, optionIndex) => {
                    const label = option.category;
                    const selected =
                        decision?.categoryId === option.categoryId ||
                        (decision?.categoryName === option.category && !option.categoryId);
                    if (!isCurrent) {
                        return (
                            <span
                                key={`${option.rank}-${option.categoryId ?? option.category}`}
                                className={selected ? `${classes.alt} ${classes.altSelected}` : classes.alt}
                            >
                                <kbd className={classes.altKey}>{optionIndex + 1}</kbd>
                                {label}
                            </span>
                        );
                    }
                    return (
                        <UnstyledButton
                            key={`${option.rank}-${option.categoryId ?? option.category}`}
                            className={selected ? `${classes.alt} ${classes.altSelected}` : classes.alt}
                            tabIndex={-1}
                            onClick={(event) => {
                                event.stopPropagation();
                                onPickOption(option);
                            }}
                        >
                            <kbd className={classes.altKey}>{optionIndex + 1}</kbd>
                            {label}
                        </UnstyledButton>
                    );
                })}
                {isCurrent ? (
                    <Select
                        className={classes.catalog}
                        data={[...categoryGroups]}
                        nothingFoundMessage="No matching category"
                        placeholder="Other…"
                        searchable
                        size="xs"
                        value={null}
                        onClick={(event) => {
                            event.stopPropagation();
                        }}
                        onChange={(categoryId) => {
                            if (categoryId) {
                                onPickCategoryId(categoryId);
                            }
                        }}
                    />
                ) : null}
            </td>
            <td className={classes.status} data-action={decision?.action}>
                {statusLabel(decision)}
            </td>
        </tr>
    );
}

function statusLabel(decision: SessionDecision | undefined): string {
    switch (decision?.action) {
        case 'approved':
            return 'Accepted';
        case 'changed':
            return 'Changed';
        case 'rejected':
            return 'Rejected';
        default:
            return '';
    }
}
