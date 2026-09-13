import type { PeriodicSeriesDto } from '@budget-tools/web-sdk';
import { UnstyledButton } from '@mantine/core';

import type { RepeatingCategoryFilter } from './filterRepeatingSeries';
import { RepeatingSeriesCard } from './RepeatingSeriesCard';
import classes from './RepeatingSeriesList.module.css';

type RepeatingSeriesListProps = {
    filter: RepeatingCategoryFilter;
    mixedCount: number;
    onFilter: (filter: RepeatingCategoryFilter) => void;
    series: readonly PeriodicSeriesDto[];
    todayIso: string;
    totalCount: number;
};

const FILTERS: ReadonlyArray<{ id: RepeatingCategoryFilter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'stable', label: 'Clear category' },
    { id: 'mixed', label: 'Mixed or unknown' },
];

export function RepeatingSeriesList({
    filter,
    mixedCount,
    onFilter,
    series,
    todayIso,
    totalCount,
}: RepeatingSeriesListProps) {
    return (
        <div className={classes.wrap}>
            <div className={classes.bar}>
                <p className={classes.count}>
                    {totalCount === 1 ? '1 series' : `${totalCount} series`}
                    {mixedCount > 0 ? ` · ${mixedCount} mixed category` : ''}
                </p>
                <fieldset className={classes.instrument}>
                    <legend className={classes.legend}>Filter by category confidence</legend>
                    {FILTERS.map((item) => {
                        const active = filter === item.id;
                        return (
                            <UnstyledButton
                                key={item.id}
                                className={active ? `${classes.chip} ${classes.chipActive}` : classes.chip}
                                aria-pressed={active}
                                onClick={() => {
                                    onFilter(item.id);
                                }}
                            >
                                {item.label}
                            </UnstyledButton>
                        );
                    })}
                </fieldset>
            </div>
            <ol className={classes.list}>
                {series.length === 0 ? <li className={classes.empty}>No series match this filter.</li> : null}
                {series.map((item) => (
                    <li key={item.id}>
                        <RepeatingSeriesCard series={item} todayIso={todayIso} />
                    </li>
                ))}
            </ol>
        </div>
    );
}
