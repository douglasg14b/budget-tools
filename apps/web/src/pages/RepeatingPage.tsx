import { listPeriodicSeriesOptions } from '@budget-tools/web-sdk';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { BackendErrorNotice } from '../components/BackendErrorNotice';
import type { RepeatingCategoryFilter } from '../components/repeating/filterRepeatingSeries';
import { filterRepeatingSeries, localIsoDate, mixedCategoryCount } from '../components/repeating/filterRepeatingSeries';
import { RepeatingSeriesList } from '../components/repeating/RepeatingSeriesList';
import classes from './RepeatingPage.module.css';

export function RepeatingPage() {
    const seriesQuery = useQuery(listPeriodicSeriesOptions());
    const [filter, setFilter] = useState<RepeatingCategoryFilter>('all');
    const todayIso = localIsoDate();
    const allSeries = seriesQuery.data?.series ?? [];
    const mixedCount = mixedCategoryCount(allSeries);
    const visible = useMemo(() => filterRepeatingSeries(allSeries, filter), [allSeries, filter]);

    return (
        <div className={classes.page}>
            <header className={classes.header}>
                <div className={classes.headerCopy}>
                    <p className={classes.kicker}>Cadence</p>
                    <h1 className={classes.title}>Repeating</h1>
                    <p className={classes.lede}>
                        Subscriptions, rent, and other charges that keep the same beat. Mixed-category rows are in the
                        ledger as a series, but not trusted for auto-categorize.
                    </p>
                </div>
            </header>

            {seriesQuery.error ? <BackendErrorNotice error={seriesQuery.error} /> : null}

            {seriesQuery.isPending ? <p className={classes.empty}>Loading repeating charges…</p> : null}

            {!seriesQuery.isPending && !seriesQuery.error && allSeries.length === 0 ? (
                <p className={classes.empty}>No repeating series detected in the local ledger yet.</p>
            ) : null}

            {!seriesQuery.isPending && allSeries.length > 0 ? (
                <RepeatingSeriesList
                    filter={filter}
                    mixedCount={mixedCount}
                    onFilter={setFilter}
                    series={visible}
                    todayIso={todayIso}
                    totalCount={allSeries.length}
                />
            ) : null}
        </div>
    );
}
