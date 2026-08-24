import type { CategorizationQueueItemDto } from '@budget-tools/web-sdk';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { travelWindowChipLabel } from '../FlagChips';
import { formatTransactionDate } from '../formatTransactionDate';
import { formatYnabAmount } from '../formatYnabAmount';
import { humanizeEnum } from '../humanizeEnum';
import { QueuePrefetchSentinel } from '../QueuePrefetchSentinel';
import classes from './ClassifyFilmstrip.module.css';
import { isCertainProposal } from './isCertainProposal';
import type { SessionDecision, SessionDecisions } from './sessionDecisions';

type ClassifyFilmstripProps = {
    currentId: string | undefined;
    hasMoreNewer: boolean;
    hasMoreOlder: boolean;
    isExpandingNewer: boolean;
    isExpandingOlder: boolean;
    items: readonly CategorizationQueueItemDto[];
    onNeedNewer: () => void;
    onNeedOlder: () => void;
    onSelect: (transactionId: string) => void;
    session: SessionDecisions;
};

export function ClassifyFilmstrip({
    currentId,
    hasMoreNewer,
    hasMoreOlder,
    isExpandingNewer,
    isExpandingOlder,
    items,
    onNeedNewer,
    onNeedOlder,
    onSelect,
    session,
}: ClassifyFilmstripProps) {
    const currentRef = useRef<HTMLButtonElement>(null);
    const [listEl, setListEl] = useState<HTMLOListElement | null>(null);
    const previousFirstId = useRef<string | undefined>(undefined);
    const previousScrollHeight = useRef(0);

    useLayoutEffect(() => {
        const firstId = items[0]?.transaction.id;
        if (listEl && previousFirstId.current && firstId !== previousFirstId.current) {
            listEl.scrollTop += listEl.scrollHeight - previousScrollHeight.current;
        }
        previousFirstId.current = firstId;
        previousScrollHeight.current = listEl?.scrollHeight ?? 0;
    }, [items, listEl]);

    useEffect(() => {
        currentRef.current?.scrollIntoView({ block: 'nearest' });
    }, [currentId]);

    return (
        <nav className={classes.rail} aria-label="Review queue">
            <p className={classes.heading}>Queue</p>
            <ol ref={setListEl} className={classes.list}>
                <li>
                    <QueuePrefetchSentinel
                        enabled={hasMoreNewer}
                        isLoading={isExpandingNewer}
                        requireScroll
                        root={listEl}
                        onNeedMore={onNeedNewer}
                    />
                </li>
                {items.map((item, index) => {
                    const decision = session.byId[item.transaction.id];
                    const isCurrent = item.transaction.id === currentId;
                    const payee = item.transaction.payeeName || item.transaction.importPayeeName || '—';
                    return (
                        <li key={item.transaction.id}>
                            <button
                                ref={isCurrent ? currentRef : undefined}
                                type="button"
                                className={classes.item}
                                data-current={isCurrent || undefined}
                                data-action={decision?.action}
                                data-certain={isCertainProposal(item.proposal) || undefined}
                                data-travel={item.proposal.flags.isTravelWindow || undefined}
                                onClick={() => {
                                    onSelect(item.transaction.id);
                                }}
                            >
                                <span className={classes.index}>{index + 1}</span>
                                <span className={classes.body}>
                                    <span className={classes.payee}>{payee}</span>
                                    <span className={classes.meta}>
                                        {formatTransactionDate(item.transaction.date)}
                                        {item.proposal.periodicMatch
                                            ? ` · ${humanizeEnum(item.proposal.periodicMatch.cadence)}`
                                            : null}
                                        {item.proposal.flags.isTravelWindow
                                            ? ` · ${travelWindowChipLabel(item.proposal.travelWindow)}`
                                            : null}
                                        {decision ? ` · ${decisionVerb(decision)}` : null}
                                        {!decision && isCertainProposal(item.proposal) ? ' · Certain' : null}
                                    </span>
                                </span>
                                <span
                                    className={classes.amount}
                                    data-inflow={item.transaction.amount >= 0 || undefined}
                                >
                                    {formatYnabAmount(item.transaction.amount)}
                                </span>
                            </button>
                        </li>
                    );
                })}
                <li>
                    <QueuePrefetchSentinel
                        enabled={hasMoreOlder}
                        isLoading={isExpandingOlder}
                        requireScroll
                        root={listEl}
                        onNeedMore={onNeedOlder}
                    />
                </li>
            </ol>
        </nav>
    );
}

function decisionVerb(decision: SessionDecision): string {
    switch (decision.action) {
        case 'approved':
            return 'Accepted';
        case 'changed':
            return 'Changed';
        case 'rejected':
            return 'Rejected';
    }
}
