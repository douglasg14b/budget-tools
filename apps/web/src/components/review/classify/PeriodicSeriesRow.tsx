import type { TransactionDetailDto } from '@budget-tools/web-sdk';

import { formatTransactionDate } from '../formatTransactionDate';
import { formatYnabAmount } from '../formatYnabAmount';
import classes from './PeriodicSeriesRow.module.css';

type PeriodicSeriesRowProps = {
    current?: boolean;
    transaction: TransactionDetailDto;
};

export function PeriodicSeriesRow({ current, transaction }: PeriodicSeriesRowProps) {
    const payee = transaction.payeeName || transaction.importPayeeName || '—';
    return (
        <article className={classes.row} data-current={current || undefined}>
            <time className={classes.date} dateTime={transaction.date}>
                {formatTransactionDate(transaction.date)}
            </time>
            <div className={classes.identity}>
                <p className={classes.payee}>{payee}</p>
                <p className={classes.meta}>
                    {transaction.categoryName || 'Uncategorized'}
                    {transaction.accountName ? ` · ${transaction.accountName}` : ''}
                    {transaction.memo ? ` · ${transaction.memo}` : ''}
                </p>
            </div>
            <p className={classes.amount} data-inflow={transaction.amount >= 0 || undefined}>
                {formatYnabAmount(transaction.amount)}
            </p>
        </article>
    );
}
