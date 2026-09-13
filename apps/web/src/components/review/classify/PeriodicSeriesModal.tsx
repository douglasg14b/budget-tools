import type { PeriodicMatchDto, TransactionDetailDto } from '@budget-tools/web-sdk';
import { Modal } from '@mantine/core';
import { useEffect } from 'react';

import { formatTransactionDate } from '../formatTransactionDate';
import { formatYnabAmount } from '../formatYnabAmount';
import { humanizeEnum } from '../humanizeEnum';
import { CLASSIFY_DIALOG_ATTR } from './classifyKeys';
import { formatPeriodicHint, formatPeriodicSeriesCaption } from './formatPeriodicHint';
import classes from './PeriodicSeriesModal.module.css';
import { PeriodicSeriesRow } from './PeriodicSeriesRow';

type PeriodicSeriesModalProps = {
    conflict: boolean;
    current: TransactionDetailDto;
    match: PeriodicMatchDto;
    onClose: () => void;
    opened: boolean;
    relatedTransactions: readonly TransactionDetailDto[];
};

export function PeriodicSeriesModal({
    conflict,
    current,
    match,
    onClose,
    opened,
    relatedTransactions,
}: PeriodicSeriesModalProps) {
    const cadence = humanizeEnum(match.cadence);
    const caption = formatPeriodicSeriesCaption(match, relatedTransactions.length);

    useEffect(() => {
        if (!opened) {
            return;
        }
        document.body.setAttribute(CLASSIFY_DIALOG_ATTR, 'true');
        return () => {
            document.body.removeAttribute(CLASSIFY_DIALOG_ATTR);
        };
    }, [opened]);

    return (
        <Modal
            centered
            opened={opened}
            padding={0}
            radius="md"
            size="34rem"
            title={`${cadence} series`}
            classNames={{
                overlay: classes.overlay,
                content: classes.content,
                header: classes.header,
                title: classes.title,
                body: classes.body,
                close: classes.close,
            }}
            onClose={onClose}
        >
            <p className={classes.lede}>{formatPeriodicHint(match, { conflict })}</p>
            <dl className={classes.stats}>
                <div>
                    <dt>Median</dt>
                    <dd data-inflow={match.medianAmount >= 0 || undefined}>{formatYnabAmount(match.medianAmount)}</dd>
                </div>
                <div>
                    <dt>Last seen</dt>
                    <dd>{formatTransactionDate(match.lastDate)}</dd>
                </div>
                <div>
                    <dt>History</dt>
                    <dd>{match.category || '—'}</dd>
                </div>
            </dl>
            {conflict ? (
                <p className={classes.conflict}>
                    Prior charges landed in {match.category} — that does not match this suggestion.
                </p>
            ) : null}

            <section className={classes.section}>
                <h3 className={classes.sectionTitle}>This charge</h3>
                <PeriodicSeriesRow current transaction={current} />
            </section>

            <section className={classes.section}>
                <h3 className={classes.sectionTitle}>Prior charges</h3>
                {caption ? <p className={classes.caption}>{caption}</p> : null}
                {relatedTransactions.length > 0 ? (
                    <ol className={classes.timeline}>
                        {relatedTransactions.map((transaction) => (
                            <li key={transaction.id}>
                                <PeriodicSeriesRow transaction={transaction} />
                            </li>
                        ))}
                    </ol>
                ) : (
                    <p className={classes.empty}>No prior charges found in the local ledger.</p>
                )}
            </section>
        </Modal>
    );
}
