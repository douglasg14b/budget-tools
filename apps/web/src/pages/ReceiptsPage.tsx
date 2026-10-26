import { getOperatingModeOptions } from '@budget-tools/web-sdk';
import { ActionIcon, Collapse, Indicator } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { ReceiptsFilterBar } from '../components/review/receipts/ReceiptsFilterBar';
import { ReceiptsInbox } from '../components/review/receipts/ReceiptsInbox';
import type { ReceiptsSearchState } from '../components/review/receipts/receiptsSearchParams';
import {
    parseReceiptsSearchParams,
    receiptsFilterCount,
    serializeReceiptsSearchParams,
} from '../components/review/receipts/receiptsSearchParams';
import { useIsNarrow } from '../components/useIsNarrow';
import type { OperatingMode } from '../operatingMode/operatingModeCopy';
import { operatingModeReceiptsNote } from '../operatingMode/operatingModeCopy';
import classes from './ReceiptsPage.module.css';

export function ReceiptsPage() {
    const modeQuery = useQuery(getOperatingModeOptions());
    const mode: OperatingMode = modeQuery.data?.mode ?? 'practice';
    const narrow = useIsNarrow();
    const [searchParams, setSearchParams] = useSearchParams();
    const search = parseReceiptsSearchParams(searchParams);
    const filterCount = receiptsFilterCount(search);
    // A phone arriving with filters in the URL (e.g. Back from a receipt) sees them open.
    const [filtersOpen, setFiltersOpen] = useState(filterCount > 0);

    const updateSearch = useCallback(
        (patch: Partial<ReceiptsSearchState>) => {
            setSearchParams(
                (previous) => serializeReceiptsSearchParams({ ...parseReceiptsSearchParams(previous), ...patch }),
                { replace: true },
            );
        },
        [setSearchParams],
    );
    const clearFilters = useCallback(() => {
        updateSearch({ q: undefined, reimbursable: false, bound: undefined, issue: undefined });
    }, [updateSearch]);

    return (
        <div className={classes.page}>
            <header className={classes.header}>
                <div className={classes.headerCopy}>
                    <div className={classes.titleRow}>
                        <div className={classes.titleBlock}>
                            <p className={classes.kicker}>Tapes</p>
                            <h1 className={classes.title}>Receipts</h1>
                        </div>
                        {narrow ? (
                            <Indicator disabled={filterCount === 0} label={filterCount} size={16} offset={4}>
                                <ActionIcon
                                    aria-label="Search and filters"
                                    aria-expanded={filtersOpen}
                                    size="xl"
                                    variant={filtersOpen ? 'light' : 'subtle'}
                                    color="gray"
                                    onClick={() => {
                                        setFiltersOpen((open) => !open);
                                    }}
                                >
                                    <IconSearch size={20} />
                                </ActionIcon>
                            </Indicator>
                        ) : null}
                    </div>
                    {narrow ? (
                        <Collapse expanded={filtersOpen}>
                            <div className={classes.narrowFilters}>
                                <ReceiptsFilterBar compact search={search} onChange={updateSearch} />
                            </div>
                        </Collapse>
                    ) : null}
                    <p className={classes.lede}>
                        Capture a pile of stills without picking a charge first. A receipt binds itself once its exact
                        total shows up on the bank and Jev confirms it is the same purchase; tips and misses wait for
                        you.
                    </p>
                </div>
                <p className={classes.note} data-mode={mode}>
                    {operatingModeReceiptsNote(mode)}
                </p>
            </header>
            <ReceiptsInbox
                filterBar={narrow ? null : <ReceiptsFilterBar search={search} onChange={updateSearch} />}
                live={mode === 'live'}
                search={search}
                onClearFilters={clearFilters}
            />
        </div>
    );
}
