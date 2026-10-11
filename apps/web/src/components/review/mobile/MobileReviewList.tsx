import type { ApprovalTier, CategorizationQueueItemDto, QueueSummaryDto } from '@budget-tools/web-sdk';
import { ActionIcon, Button, Collapse, Indicator, SegmentedControl, UnstyledButton } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconCheck, IconChevronRight, IconSearch } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';

import type { OperatingMode } from '../../../operatingMode/operatingModeCopy';
import { isCertainProposal } from '../classify/isCertainProposal';
import type { SessionDecision } from '../classify/sessionDecisions';
import type { ClassifySession } from '../classify/useClassifySession';
import { usePredictWindow } from '../classify/usePredictWindow';
import { formatConfidence } from '../formatConfidence';
import { formatYnabAmount } from '../formatYnabAmount';
import { humanizeEnum } from '../humanizeEnum';
import { listQueueAccounts } from '../listQueueAccounts';
import { QueueFilters } from '../QueueFilters';
import { QueuePrefetchSentinel } from '../QueuePrefetchSentinel';
import { QueueSearchInput } from '../QueueSearchInput';
import type { QueueSearchState } from '../queueSearchParams';
import { APPROVAL_TIERS, queueFiltersActive, toggleTierFilter } from '../queueSearchParams';
import classes from './MobileReviewList.module.css';
import { canQuickAccept, certainItems, formatShortDate, rowCategoryLabel } from './mobileReviewRows';
import { useVisibleRowAnchor } from './useVisibleRowAnchor';

export type MobileReviewView = 'all' | 'certain';

type MobileReviewListProps = {
    /** Every loaded row, for the account filter's choices. */
    allItems: readonly CategorizationQueueItemDto[];
    classify: ClassifySession;
    focusId: string | undefined;
    hasMoreNewer: boolean;
    hasMoreOlder: boolean;
    isExpandingNewer: boolean;
    isExpandingOlder: boolean;
    /** A search is still debouncing, or older pages are being checked for matches. */
    isSearching: boolean;
    /** Rows after filters, newest first. */
    items: readonly CategorizationQueueItemDto[];
    mode: OperatingMode;
    onAcceptAllCertain: () => void;
    onNeedNewer: () => void;
    onNeedOlder: () => void;
    onOpen: (transactionId: string) => void;
    onSearchChange: (patch: Partial<QueueSearchState>) => void;
    onViewChange: (view: MobileReviewView) => void;
    pendingCount: number | undefined;
    search: QueueSearchState;
    summary: QueueSummaryDto | undefined;
    view: MobileReviewView;
};

/** Scroll pause before the rows on screen are sent for scoring. */
const PREDICT_SETTLE_MS = 350;

const TIER_COUNT_KEY = {
    AutoApply: 'autoApply',
    Suggested: 'suggested',
    Review: 'review',
    Blocked: 'blocked',
} as const satisfies Record<ApprovalTier, keyof QueueSummaryDto>;

/**
 * Phone review: two-line rows to scroll and accept in one tap, or tap through to the full card.
 * Queue, Classify and Table on the desktop all collapse into this one list.
 */
export function MobileReviewList({
    allItems,
    classify,
    focusId,
    hasMoreNewer,
    hasMoreOlder,
    isExpandingNewer,
    isExpandingOlder,
    isSearching,
    items,
    mode,
    onAcceptAllCertain,
    onNeedNewer,
    onNeedOlder,
    onOpen,
    onSearchChange,
    onViewChange,
    pendingCount,
    search,
    summary,
    view,
}: MobileReviewListProps) {
    const [filtersOpen, setFiltersOpen] = useState(queueFiltersActive(search));
    const [list, setList] = useState<HTMLOListElement | null>(null);
    const accounts = useMemo(() => listQueueAccounts(allItems), [allItems]);
    const rows = view === 'certain' ? certainItems(items) : items;
    const rowsKey = rows.map((item) => item.transaction.id).join('|');
    const anchorId = useVisibleRowAnchor(list, rowsKey);
    // Score where the scroll comes to rest, not every band flicked past on the way.
    const [settledAnchorId] = useDebouncedValue(anchorId, PREDICT_SETTLE_MS);
    const predict = usePredictWindow({ currentId: settledAnchorId, items });
    const { tally } = classify;
    const certainLeft = classify.certainRemaining.length;
    const filterCount = (search.q ? 1 : 0) + (search.accountId ? 1 : 0) + (search.tiers ? 1 : 0);

    useEffect(() => {
        if (!focusId || !list) {
            return;
        }
        list.querySelector(`[data-row-id="${CSS.escape(focusId)}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [focusId, list]);

    return (
        <div className={classes.page} data-view={view}>
            <header className={classes.header}>
                <div className={classes.titleRow}>
                    <h1 className={classes.title}>Review</h1>
                    <span className={classes.modePill} data-mode={mode}>
                        {mode === 'live' ? 'Live' : 'Practice'}
                    </span>
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
                </div>
                <p className={classes.counts}>
                    {tally.remaining} left
                    {tally.accepted > 0 ? ` · ${tally.accepted} accepted` : ''}
                    {tally.changed > 0 ? ` · ${tally.changed} changed` : ''}
                    {tally.rejected > 0 ? ` · ${tally.rejected} rejected` : ''}
                    {pendingCount !== undefined && pendingCount > items.length ? ` · ${pendingCount} pending` : ''}
                </p>
                <SegmentedControl
                    fullWidth
                    className={classes.viewSwitch}
                    data={[
                        { value: 'all', label: `All ${items.length}${hasMoreOlder ? '+' : ''}` },
                        { value: 'certain', label: `Certain ${certainLeft}` },
                    ]}
                    value={view}
                    onChange={(next) => {
                        onViewChange(next as MobileReviewView);
                    }}
                />
                <Collapse expanded={filtersOpen}>
                    <div className={classes.filters}>
                        <QueueSearchInput
                            compact
                            value={search.q}
                            onChange={(q) => {
                                onSearchChange({ q });
                            }}
                        />
                        {summary ? (
                            <fieldset className={classes.tiers}>
                                <legend className={classes.srOnly}>Filter by approval tier</legend>
                                {APPROVAL_TIERS.map((tier) => {
                                    const active = search.tiers?.includes(tier) ?? false;
                                    return (
                                        <UnstyledButton
                                            key={tier}
                                            className={classes.tier}
                                            data-tier={tier}
                                            data-active={active || undefined}
                                            aria-pressed={active}
                                            onClick={() => {
                                                onSearchChange({ tiers: toggleTierFilter(search.tiers, tier) });
                                            }}
                                        >
                                            {humanizeEnum(tier)}
                                            <span className={classes.tierCount}>{summary[TIER_COUNT_KEY[tier]]}</span>
                                        </UnstyledButton>
                                    );
                                })}
                            </fieldset>
                        ) : null}
                        <QueueFilters
                            accounts={accounts}
                            accountId={search.accountId}
                            onAccountIdChange={(accountId) => {
                                onSearchChange({ accountId });
                            }}
                        />
                    </div>
                </Collapse>
            </header>

            {view === 'all' ? (
                <QueuePrefetchSentinel
                    enabled={hasMoreNewer}
                    isLoading={isExpandingNewer}
                    loadingHint="Loading newer…"
                    requireScroll
                    onNeedMore={onNeedNewer}
                />
            ) : null}
            {rows.length === 0 ? (
                <div className={classes.empty}>
                    <p className={classes.emptyCopy}>{emptyCopy(view, pendingCount, isSearching)}</p>
                    {view === 'all' && !isSearching && queueFiltersActive(search) ? (
                        <Button
                            variant="subtle"
                            color="gray"
                            onClick={() => {
                                onSearchChange({ tiers: undefined, accountId: undefined, q: undefined });
                            }}
                        >
                            Clear filters
                        </Button>
                    ) : null}
                </div>
            ) : null}
            <ol ref={setList} className={classes.rows}>
                {rows.map((item) => (
                    <ReviewRow
                        key={item.transaction.id}
                        decision={classify.session.byId[item.transaction.id]}
                        item={item}
                        payee={classify.payeeName(item)}
                        scoring={predict.isPending && !item.proposal}
                        onAccept={() => {
                            classify.acceptItem(item);
                        }}
                        onOpen={() => {
                            onOpen(item.transaction.id);
                        }}
                    />
                ))}
            </ol>
            <QueuePrefetchSentinel
                enabled={hasMoreOlder}
                isLoading={isExpandingOlder}
                loadingHint="Loading older…"
                requireScroll
                onNeedMore={onNeedOlder}
            />

            {view === 'certain' && rows.length > 0 ? (
                <div className={classes.bulkBar}>
                    <Button
                        fullWidth
                        disabled={certainLeft === 0}
                        leftSection={<IconCheck size={20} />}
                        size="lg"
                        onClick={onAcceptAllCertain}
                    >
                        {certainLeft === 0 ? 'All certain accepted' : `Accept all ${certainLeft} certain`}
                    </Button>
                </div>
            ) : null}
        </div>
    );
}

function emptyCopy(view: MobileReviewView, pendingCount: number | undefined, isSearching: boolean): string {
    if (pendingCount === 0) {
        return 'All caught up. No pending transactions.';
    }
    if (view === 'certain') {
        return 'No 100% suggestions among the loaded rows.';
    }
    return isSearching ? 'Looking for matching transactions…' : 'No transactions match these filters.';
}

type ReviewRowProps = {
    decision: SessionDecision | undefined;
    item: CategorizationQueueItemDto;
    onAccept: () => void;
    onOpen: () => void;
    payee: string;
    scoring: boolean;
};

function ReviewRow({ decision, item, onAccept, onOpen, payee, scoring }: ReviewRowProps) {
    const { transaction, proposal } = item;
    const label = rowCategoryLabel(item, decision);
    const certain = isCertainProposal(proposal);
    const quickAccept = canQuickAccept(item, decision);

    return (
        <li
            className={classes.row}
            data-row-id={transaction.id}
            data-tier={proposal?.tier}
            data-action={decision?.action}
            data-certain={(certain && !decision) || undefined}
        >
            <button type="button" className={classes.rowMain} onClick={onOpen}>
                <span className={classes.lineOne}>
                    <span className={classes.payee}>{payee || '—'}</span>
                    <span className={classes.amount} data-inflow={transaction.amount >= 0 || undefined}>
                        {formatYnabAmount(transaction.amount)}
                    </span>
                </span>
                <span className={classes.lineTwo}>
                    <span className={classes.date}>{formatShortDate(transaction.date)}</span>
                    <span className={label ? classes.category : classes.categoryMuted}>
                        {label ?? (scoring ? 'Scoring…' : proposal ? 'No suggestion' : 'Not scored yet')}
                    </span>
                    {proposal && !decision ? (
                        <span className={classes.confidence}>{formatConfidence(proposal.confidence)}</span>
                    ) : null}
                </span>
            </button>
            {quickAccept ? (
                <ActionIcon
                    aria-label={`Accept ${label ?? 'suggestion'} for ${payee}`}
                    className={classes.quickAccept}
                    radius="xl"
                    size={44}
                    variant={certain ? 'filled' : 'light'}
                    onClick={onAccept}
                >
                    <IconCheck size={22} />
                </ActionIcon>
            ) : (
                <span className={classes.trailing} aria-hidden="true">
                    {decision ? null : <IconChevronRight size={20} />}
                </span>
            )}
        </li>
    );
}
