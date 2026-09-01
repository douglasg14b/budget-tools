import type { ReceiptBindCandidateDto, ReceiptMatchDto } from '@budget-tools/web-sdk';
import { Button } from '@mantine/core';
import { useMemo, useState } from 'react';

import { formatTransactionDate } from '../formatTransactionDate';
import { formatYnabAmount } from '../formatYnabAmount';
import { QueueSearchInput } from '../QueueSearchInput';
import { filterBindCandidates } from './filterBindCandidates';
import classes from './ReceiptBindPanel.module.css';

type ReceiptBindPanelProps = {
    readonly asking: boolean;
    readonly binding: boolean;
    readonly boundTransactionId: string | null;
    readonly error: string | null;
    readonly live: boolean;
    readonly match: ReceiptMatchDto | undefined;
    readonly onBind: (transactionId: string) => void;
    readonly onDetach: () => void;
};

export function ReceiptBindPanel({
    asking,
    binding,
    boundTransactionId,
    error,
    live,
    match,
    onBind,
    onDetach,
}: ReceiptBindPanelProps) {
    const [query, setQuery] = useState<string | undefined>();
    const candidates = match?.bindCandidates ?? [];
    const closeMatches = useMemo(() => {
        const closeIds = new Set((match?.closeMatches ?? []).map((row) => row.transactionId));
        return candidates.filter((row) => closeIds.has(row.id));
    }, [candidates, match?.closeMatches]);
    const searchHits = useMemo(() => filterBindCandidates(candidates, query), [candidates, query]);
    const bound = candidates.find((row) => row.id === boundTransactionId);
    const exactFailed = Boolean(match && !match.autoBind && !boundTransactionId);

    if (asking && !match) {
        return <p className={classes.quiet}>Looking for a matching charge…</p>;
    }

    return (
        <div className={classes.panel}>
            {bound ? (
                <div className={classes.boundCard}>
                    <p className={classes.kicker}>Bound to</p>
                    <CandidateRow candidate={bound} />
                    {live ? (
                        <Button size="compact-sm" variant="subtle" color="gray" loading={binding} onClick={onDetach}>
                            Detach
                        </Button>
                    ) : (
                        <Button size="compact-sm" variant="subtle" color="gray" onClick={onDetach}>
                            Detach this session
                        </Button>
                    )}
                </div>
            ) : null}

            {exactFailed && closeMatches.length > 0 ? (
                <section className={classes.section} aria-labelledby="close-matches-title">
                    <h3 id="close-matches-title" className={classes.heading}>
                        Exact match failed
                    </h3>
                    <p className={classes.lede}>These look like a tip. Pick one — nothing binds until you do.</p>
                    <ul className={classes.list}>
                        {closeMatches.map((row) => (
                            <li key={row.id}>
                                <CandidateRow candidate={row} />
                                <Button
                                    size="compact-sm"
                                    loading={binding}
                                    onClick={() => {
                                        onBind(row.id);
                                    }}
                                >
                                    Bind
                                </Button>
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            {!boundTransactionId ? (
                <section className={classes.section} aria-labelledby="search-bind-title">
                    <h3 id="search-bind-title" className={classes.heading}>
                        Search charges
                    </h3>
                    <QueueSearchInput value={query} onChange={setQuery} />
                    {searchHits.length === 0 ? (
                        <p className={classes.quiet}>
                            {candidates.length === 0
                                ? 'No charges in the receipt date window yet.'
                                : 'No charges match that search.'}
                        </p>
                    ) : (
                        <ul className={classes.list}>
                            {searchHits.map((row) => (
                                <li key={row.id}>
                                    <CandidateRow candidate={row} />
                                    <Button
                                        size="compact-sm"
                                        variant="default"
                                        loading={binding}
                                        onClick={() => {
                                            onBind(row.id);
                                        }}
                                    >
                                        Bind
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            ) : null}

            {error ? <p className={classes.error}>{error}</p> : null}
        </div>
    );
}

function CandidateRow({ candidate }: { readonly candidate: ReceiptBindCandidateDto }) {
    return (
        <p className={classes.candidate}>
            <span className={classes.payee}>{candidate.payeeName ?? candidate.importPayeeName ?? 'Unknown payee'}</span>
            <span className={classes.meta}>
                {formatTransactionDate(candidate.date)}
                <span aria-hidden="true"> · </span>
                {formatYnabAmount(candidate.amount)}
                <span aria-hidden="true"> · </span>
                {candidate.accountName}
                {candidate.categoryName ? (
                    <>
                        <span aria-hidden="true"> · </span>
                        {candidate.categoryName}
                    </>
                ) : null}
            </span>
        </p>
    );
}
