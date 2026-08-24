import type { CategorizationQueueItemDto } from '@budget-tools/web-sdk';
import { useEffect, useRef, useState } from 'react';

import { formatTransactionDate } from '../formatTransactionDate';
import { formatYnabAmount } from '../formatYnabAmount';
import { humanizeEnum } from '../humanizeEnum';
import { QueuePrefetchSentinel } from '../QueuePrefetchSentinel';
import classes from './ClassifyFilmstrip.module.css';
import { isCertainProposal } from './isCertainProposal';
import type { SessionDecision, SessionDecisions } from './sessionDecisions';

type ClassifyFilmstripProps = {
    currentId: string | undefined;
    hasMore: boolean;
    isExpanding: boolean;
    items: readonly CategorizationQueueItemDto[];
    onNeedMore: () => void;
    onSelect: (transactionId: string) => void;
    session: SessionDecisions;
};

export function ClassifyFilmstrip({
    currentId,
    hasMore,
    isExpanding,
    items,
    onNeedMore,
    onSelect,
    session,
}: ClassifyFilmstripProps) {
    const currentRef = useRef<HTMLButtonElement>(null);
    const [listEl, setListEl] = useState<HTMLOListElement | null>(null);

    useEffect(() => {
        currentRef.current?.scrollIntoView({ block: 'nearest' });
    }, [currentId]);

    return (
        <nav className={classes.rail} aria-label="Review queue">
            <p className={classes.heading}>Queue</p>
            <ol ref={setListEl} className={classes.list}>
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
                        enabled={hasMore}
                        isLoading={isExpanding}
                        requireScroll
                        root={listEl}
                        onNeedMore={onNeedMore}
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
