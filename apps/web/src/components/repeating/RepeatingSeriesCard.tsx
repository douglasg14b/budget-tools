import type { PeriodicCadence, PeriodicSeriesDto } from '@budget-tools/web-sdk';

import { formatPeriodicSeriesCaption } from '../review/classify/formatPeriodicHint';
import { PeriodicSeriesRow } from '../review/classify/PeriodicSeriesRow';
import { formatTransactionDate } from '../review/formatTransactionDate';
import { formatYnabAmount } from '../review/formatYnabAmount';
import { humanizeEnum } from '../review/humanizeEnum';
import { isExpectedNextOverdue } from './filterRepeatingSeries';
import classes from './RepeatingSeriesCard.module.css';

type RepeatingSeriesCardProps = {
    series: PeriodicSeriesDto;
    todayIso: string;
};

const CADENCE_RAIL: Record<PeriodicCadence, string> = {
    Weekly: 'Wk',
    Biweekly: '2w',
    Monthly: 'Mo',
    Quarterly: 'Qtr',
    Yearly: 'Yr',
};

export function RepeatingSeriesCard({ series, todayIso }: RepeatingSeriesCardProps) {
    const overdue = isExpectedNextOverdue(series.expectedNextDate, todayIso);
    const cadence = humanizeEnum(series.cadence);
    const caption = formatPeriodicSeriesCaption(series, series.relatedTransactions.length);
    const votePct = Math.round(series.categoryVoteShare * 100);

    return (
        <details className={classes.item} data-mixed={!series.categoryStable || undefined}>
            <summary className={classes.ticket}>
                <div className={classes.rail} aria-hidden="true">
                    <span className={classes.railCadence}>{CADENCE_RAIL[series.cadence]}</span>
                    <span className={classes.railCount}>×{series.occurrenceCount}</span>
                </div>
                <div className={classes.body}>
                    <div className={classes.head}>
                        <p className={classes.payee}>{series.payeeName}</p>
                        <p className={classes.amount} data-inflow={series.medianAmount >= 0 || undefined}>
                            {formatYnabAmount(series.medianAmount)}
                        </p>
                    </div>
                    <p className={classes.meta}>
                        {cadence}
                        {' · last '}
                        {formatTransactionDate(series.lastDate)}
                        {' · next '}
                        <span className={overdue ? classes.overdue : undefined}>
                            {formatTransactionDate(series.expectedNextDate)}
                            {overdue ? ' overdue' : ''}
                        </span>
                    </p>
                    <p className={classes.category}>
                        {series.categoryStable
                            ? `${series.category} · ${votePct}%`
                            : series.category
                              ? `Mixed · ${series.category} ${votePct}%`
                              : 'No clear category'}
                    </p>
                </div>
            </summary>
            <div className={classes.members}>
                {caption ? <p className={classes.caption}>{caption}</p> : null}
                {series.relatedTransactions.length > 0 ? (
                    <ol className={classes.timeline}>
                        {series.relatedTransactions.map((transaction) => (
                            <li key={transaction.id}>
                                <PeriodicSeriesRow transaction={transaction} />
                            </li>
                        ))}
                    </ol>
                ) : (
                    <p className={classes.empty}>No charges found in the local ledger.</p>
                )}
            </div>
        </details>
    );
}
