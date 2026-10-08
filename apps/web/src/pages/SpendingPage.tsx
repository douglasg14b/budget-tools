import type { SpendChartCategoryDto } from '@budget-tools/web-sdk';
import { getSpendChartOptions, putCategorySmoothingMutation } from '@budget-tools/web-sdk';
import { LineChart } from '@mantine/charts';
import { Checkbox, NumberInput, SegmentedControl, Table, useComputedColorScheme } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useEffect, useMemo, useRef, useState } from 'react';

import { BackendErrorNotice } from '../components/BackendErrorNotice';
import { localIsoDate } from '../components/repeating/filterRepeatingSeries';
import { formatYnabAmount } from '../components/review/formatYnabAmount';
import type { SpendRangeDays } from '../components/spending/spendChartView';
import {
    assignColorSlots,
    buildChartRows,
    MAX_CHARTED,
    rangeStart,
    resolveCharted,
    SERIES_COLORS,
} from '../components/spending/spendChartView';
import classes from './SpendingPage.module.css';

const RANGE_OPTIONS = [
    { label: '30 days', value: '30' },
    { label: '90 days', value: '90' },
    { label: '6 months', value: '180' },
    { label: '1 year', value: '365' },
];

const WHOLE_DOLLARS = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const CENTS = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function SpendingPage() {
    const [rangeDays, setRangeDays] = useLocalStorage<SpendRangeDays>({
        key: 'spending.rangeDays',
        defaultValue: 90,
    });
    const [savedCharted, setSavedCharted] = useLocalStorage<string[] | null>({
        key: 'spending.charted',
        defaultValue: null,
    });
    const colorScheme = useComputedColorScheme('dark');

    const end = localIsoDate();
    const query = { start: rangeStart(end, rangeDays), end };
    const chartQuery = useQuery({ ...getSpendChartOptions({ query }), placeholderData: keepPreviousData });
    const chart = chartQuery.data;
    const categories = chart?.categories ?? [];

    const charted = useMemo(
        () =>
            resolveCharted(
                savedCharted,
                categories.map((category) => category.categoryId),
            ),
        [savedCharted, categories],
    );
    const slotsRef = useRef(new Map<string, number>());
    const slots = useMemo(() => {
        slotsRef.current = assignColorSlots(slotsRef.current, charted);
        return slotsRef.current;
    }, [charted]);
    const palette = SERIES_COLORS[colorScheme];
    const colorOf = (categoryId: string) => palette[slots.get(categoryId) ?? 0] ?? palette[0];

    const rows = useMemo(
        () =>
            buildChartRows(chart?.days ?? [], categories, charted, (day) =>
                dayjs(day).format(rangeDays > 90 ? 'MMM D, YYYY' : 'ddd MMM D'),
            ),
        [chart?.days, categories, charted, rangeDays],
    );
    const series = categories
        .filter((category) => charted.includes(category.categoryId))
        .map((category) => ({
            name: category.categoryId,
            label: seriesLabel(category),
            color: colorOf(category.categoryId),
        }));

    const toggleCharted = (categoryId: string, checked: boolean) => {
        setSavedCharted(checked ? [...charted, categoryId] : charted.filter((id) => id !== categoryId));
    };

    return (
        <div className={classes.page}>
            <header className={classes.header}>
                <p className={classes.kicker}>Spend over time</p>
                <h1 className={classes.title}>Spending</h1>
                <p className={classes.lede}>
                    Daily spend by category. Give a category like Groceries a spread of 7 days and each shop is shared
                    evenly over the week after it, so the line shows what you actually go through per day.
                </p>
            </header>

            <div className={classes.filters}>
                <SegmentedControl
                    aria-label="Date range"
                    data={RANGE_OPTIONS}
                    onChange={(value) => setRangeDays(Number(value) as SpendRangeDays)}
                    value={String(rangeDays)}
                />
            </div>

            {chartQuery.error ? <BackendErrorNotice error={chartQuery.error} /> : null}
            {chartQuery.isPending ? <p className={classes.empty}>Loading spending…</p> : null}
            {chart && categories.length === 0 ? (
                <p className={classes.empty}>No categorized spending in this range.</p>
            ) : null}

            {chart && categories.length > 0 ? (
                <div className={classes.content} data-refetching={chartQuery.isPlaceholderData || undefined}>
                    <section className={classes.chartCard} aria-label="Daily spend chart">
                        {series.length === 0 ? (
                            <p className={classes.empty}>Tick a category below to chart it.</p>
                        ) : (
                            <LineChart
                                curveType="linear"
                                data={rows}
                                dataKey="label"
                                gridAxis="y"
                                h={340}
                                series={series}
                                strokeWidth={2}
                                tickLine="none"
                                valueFormatter={(value) => CENTS.format(value)}
                                withDots={false}
                                withLegend
                                xAxisProps={{ minTickGap: 32 }}
                                yAxisProps={{
                                    tickFormatter: (value: number) => WHOLE_DOLLARS.format(value),
                                    width: 64,
                                }}
                            />
                        )}
                    </section>

                    <section className={classes.tableCard} aria-label="Categories">
                        <p className={classes.tableHint}>
                            Chart up to {MAX_CHARTED} categories. <strong>Spread over</strong> shares each purchase
                            across that many days, starting the day it was bought; 1 charts it on the day it was spent.
                        </p>
                        <Table highlightOnHover verticalSpacing="xs">
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th className={classes.chartCol}>Chart</Table.Th>
                                    <Table.Th>Category</Table.Th>
                                    <Table.Th className={classes.numberCol}>Spent</Table.Th>
                                    <Table.Th className={classes.numberCol}>Per day</Table.Th>
                                    <Table.Th className={classes.spreadCol}>Spread over</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {categories.map((category) => {
                                    const isCharted = charted.includes(category.categoryId);
                                    return (
                                        <Table.Tr key={category.categoryId}>
                                            <Table.Td className={classes.chartCol}>
                                                <span className={classes.chartToggle}>
                                                    <Checkbox
                                                        aria-label={`Chart ${category.categoryName}`}
                                                        checked={isCharted}
                                                        disabled={!isCharted && charted.length >= MAX_CHARTED}
                                                        onChange={(event) =>
                                                            toggleCharted(
                                                                category.categoryId,
                                                                event.currentTarget.checked,
                                                            )
                                                        }
                                                    />
                                                    <span
                                                        aria-hidden="true"
                                                        className={classes.lineKey}
                                                        style={{
                                                            background: isCharted
                                                                ? colorOf(category.categoryId)
                                                                : 'transparent',
                                                        }}
                                                    />
                                                </span>
                                            </Table.Td>
                                            <Table.Td>
                                                <span className={classes.categoryName}>{category.categoryName}</span>
                                                <span className={classes.groupName}>{category.groupName}</span>
                                            </Table.Td>
                                            <Table.Td className={classes.numberCol}>
                                                {formatYnabAmount(category.totalMilliunits)}
                                            </Table.Td>
                                            <Table.Td className={classes.numberCol}>
                                                {formatYnabAmount(
                                                    Math.round(category.totalMilliunits / chart.days.length),
                                                )}
                                            </Table.Td>
                                            <Table.Td className={classes.spreadCol}>
                                                <SpreadInput category={category} />
                                            </Table.Td>
                                        </Table.Tr>
                                    );
                                })}
                            </Table.Tbody>
                        </Table>
                    </section>
                </div>
            ) : null}
        </div>
    );
}

function seriesLabel(category: SpendChartCategoryDto): string {
    return category.windowDays > 1
        ? `${category.categoryName} (${category.windowDays}-day spread)`
        : category.categoryName;
}

/** Days-to-spread input; saves on blur or Enter so typing "14" doesn't save "1" first. */
function SpreadInput({ category }: { category: SpendChartCategoryDto }) {
    const queryClient = useQueryClient();
    const [draft, setDraft] = useState<number | string>(category.windowDays);
    useEffect(() => setDraft(category.windowDays), [category.windowDays]);

    const mutation = useMutation({
        ...putCategorySmoothingMutation(),
        onSuccess: async () => {
            // Partial key match: refresh the chart for every cached range, not just the visible one.
            await queryClient.invalidateQueries({ queryKey: [{ _id: 'getSpendChart' }] });
        },
    });

    const commit = () => {
        const windowDays = typeof draft === 'number' ? draft : Number.parseInt(draft, 10);
        if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 365) {
            setDraft(category.windowDays);
            return;
        }
        if (windowDays === category.windowDays) {
            return;
        }
        mutation.mutate({ path: { categoryId: category.categoryId }, body: { windowDays } });
    };

    return (
        <NumberInput
            allowDecimal={false}
            allowNegative={false}
            aria-label={`Days to spread ${category.categoryName} over`}
            disabled={mutation.isPending}
            error={mutation.error ? 'Not saved' : undefined}
            max={365}
            min={1}
            onBlur={commit}
            onChange={setDraft}
            onKeyDown={(event) => {
                if (event.key === 'Enter') {
                    commit();
                }
            }}
            size="xs"
            suffix={Number(draft) === 1 ? ' day' : ' days'}
            value={draft}
            w={96}
        />
    );
}
