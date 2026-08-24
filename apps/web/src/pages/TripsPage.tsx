import type { TravelWindowDto, TravelWindowKindDto, TravelWindowWriteDto } from '@budget-tools/web-sdk';
import {
    createTravelWindowMutation,
    deleteTravelWindowMutation,
    getTravelBiasOptions,
    getTravelBiasQueryKey,
    listAccountsOptions,
    listTravelWindowsOptions,
    listTravelWindowsQueryKey,
    patchTravelBiasMutation,
    updateTravelWindowMutation,
} from '@budget-tools/web-sdk';
import { Button, MultiSelect, Switch, TextInput } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { BackendErrorNotice } from '../components/BackendErrorNotice';
import classes from './TripsPage.module.css';

type Draft = {
    name: string;
    kind: TravelWindowKindDto;
    startDate: string;
    endDate: string;
    location: string;
    accountIds: string[];
};

const emptyDraft: Draft = {
    name: '',
    kind: 'vacation',
    startDate: '',
    endDate: '',
    location: '',
    accountIds: [],
};

export function TripsPage() {
    const queryClient = useQueryClient();
    const windowsQuery = useQuery(listTravelWindowsOptions());
    const biasQuery = useQuery(getTravelBiasOptions());
    const accountsQuery = useQuery(listAccountsOptions());
    const [draft, setDraft] = useState<Draft>(emptyDraft);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);

    const accounts = accountsQuery.data?.accounts ?? [];
    const windows = windowsQuery.data?.windows ?? [];
    const biasEnabled = biasQuery.data?.enabled ?? true;

    const createMutation = useMutation({
        ...createTravelWindowMutation(),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: listTravelWindowsQueryKey() });
            setDraft(emptyDraft);
            setEditingId(null);
            setFormError(null);
        },
    });
    const updateMutation = useMutation({
        ...updateTravelWindowMutation(),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: listTravelWindowsQueryKey() });
            setDraft(emptyDraft);
            setEditingId(null);
            setFormError(null);
        },
    });
    const deleteMutation = useMutation({
        ...deleteTravelWindowMutation(),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: listTravelWindowsQueryKey() });
            if (editingId) {
                setDraft(emptyDraft);
                setEditingId(null);
            }
        },
    });
    const biasMutation = useMutation({
        ...patchTravelBiasMutation(),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: getTravelBiasQueryKey() });
        },
    });

    const mutationError =
        createMutation.error ??
        updateMutation.error ??
        deleteMutation.error ??
        biasMutation.error ??
        windowsQuery.error;

    const sortedWindows = useMemo(
        () =>
            [...windows].sort(
                (left, right) => right.startDate.localeCompare(left.startDate) || left.name.localeCompare(right.name),
            ),
        [windows],
    );

    function saveDraft(): void {
        const name = draft.name.trim();
        if (!name) {
            setFormError('Give this trip a name.');
            return;
        }
        if (!draft.startDate || !draft.endDate) {
            setFormError('Start and end dates are required.');
            return;
        }
        if (draft.startDate > draft.endDate) {
            setFormError('Start date must be on or before end date.');
            return;
        }

        const selectedAccounts = draft.accountIds
            .map((accountId) => {
                const fromCatalog = accounts.find((item) => item.id === accountId);
                if (fromCatalog) {
                    return { id: fromCatalog.id, name: fromCatalog.name };
                }
                const editing = editingId ? windows.find((window) => window.id === editingId) : undefined;
                const fromWindow = editing?.accounts.find((item) => item.id === accountId);
                return fromWindow ? { id: fromWindow.id, name: fromWindow.name } : null;
            })
            .filter((account): account is { id: string; name: string } => account !== null);
        const location = draft.location.trim();
        const body: TravelWindowWriteDto = {
            name,
            kind: draft.kind,
            startDate: draft.startDate,
            endDate: draft.endDate,
            location: location || null,
            accounts: selectedAccounts,
        };
        setFormError(null);
        if (editingId) {
            updateMutation.mutate({ path: { id: editingId }, body });
            return;
        }
        createMutation.mutate({ body });
    }

    function startEdit(window: TravelWindowDto): void {
        setEditingId(window.id);
        setDraft({
            name: window.name,
            kind: window.kind,
            startDate: window.startDate,
            endDate: window.endDate,
            location: window.location ?? '',
            accountIds: window.accounts.map((account) => account.id),
        });
        setFormError(null);
    }

    function patchDraft(patch: Partial<Draft>): void {
        setDraft((current) => ({ ...current, ...patch }));
    }

    function accountSelectData(): Array<{ value: string; label: string }> {
        const data = accounts.map((account) => ({ value: account.id, label: account.name }));
        const knownIds = new Set(data.map((item) => item.value));
        for (const accountId of draft.accountIds) {
            if (knownIds.has(accountId)) {
                continue;
            }
            const fromWindow = windows.flatMap((window) => window.accounts).find((account) => account.id === accountId);
            data.push({ value: accountId, label: fromWindow?.name ?? accountId });
            knownIds.add(accountId);
        }
        return data;
    }

    const saving = createMutation.isPending || updateMutation.isPending;

    return (
        <div className={classes.page}>
            <header className={classes.masthead}>
                <div className={classes.mastheadCopy}>
                    <p className={classes.kicker}>Itinerary</p>
                    <h1 className={classes.title}>Trips</h1>
                    <p className={classes.lede}>
                        Mark when you are away. One-off spend in a window is steered toward vacation categories or
                        Transient / Reimbursable — repeating bills stay put.
                    </p>
                </div>
                <div className={classes.stamp} data-off={biasEnabled ? undefined : true}>
                    <Switch
                        checked={biasEnabled}
                        disabled={biasQuery.isPending || biasMutation.isPending}
                        label="Use travel bias"
                        description={
                            biasEnabled
                                ? 'Windows shape suggestions until you turn this off.'
                                : 'Windows stay saved. Scoring ignores them.'
                        }
                        onChange={(event) => {
                            biasMutation.mutate({ body: { enabled: event.currentTarget.checked } });
                        }}
                    />
                </div>
            </header>

            {mutationError ? <BackendErrorNotice error={mutationError} /> : null}

            <ol className={classes.timeline}>
                {windowsQuery.isPending ? <li className={classes.empty}>Loading trips…</li> : null}
                {!windowsQuery.isPending && sortedWindows.length === 0 ? (
                    <li className={classes.empty}>No trips yet. Add a window for the next time you leave town.</li>
                ) : null}
                {sortedWindows.map((window) => (
                    <li
                        key={window.id}
                        className={classes.ticket}
                        data-kind={window.kind}
                        data-editing={editingId === window.id || undefined}
                    >
                        <div className={classes.ticketRail} aria-hidden="true">
                            <span className={classes.ticketMonth}>{monthLabel(window.startDate)}</span>
                            <span className={classes.ticketDay}>{dayLabel(window.startDate)}</span>
                        </div>
                        <div className={classes.ticketBody}>
                            <div className={classes.ticketHead}>
                                <h2 className={classes.ticketName}>{window.name}</h2>
                                <span className={classes.kindRibbon}>
                                    {window.kind === 'work' ? 'Work' : 'Vacation'}
                                </span>
                            </div>
                            <p className={classes.ticketMeta}>
                                {formatRange(window.startDate, window.endDate)}
                                {window.location ? (
                                    <>
                                        <span aria-hidden="true"> · </span>
                                        {window.location}
                                    </>
                                ) : null}
                                <span aria-hidden="true"> · </span>
                                {formatAccounts(window.accounts)}
                            </p>
                            <div className={classes.ticketActions}>
                                <Button
                                    size="compact-sm"
                                    variant="subtle"
                                    color="gray"
                                    onClick={() => startEdit(window)}
                                >
                                    Edit
                                </Button>
                                <Button
                                    size="compact-sm"
                                    variant="subtle"
                                    color="red"
                                    loading={
                                        deleteMutation.isPending && deleteMutation.variables?.path.id === window.id
                                    }
                                    onClick={() => {
                                        deleteMutation.mutate({ path: { id: window.id } });
                                    }}
                                >
                                    Remove
                                </Button>
                            </div>
                        </div>
                    </li>
                ))}
            </ol>

            <section className={classes.composer} aria-labelledby="trip-composer-title">
                <div className={classes.composerHead}>
                    <h2 id="trip-composer-title" className={classes.composerTitle}>
                        {editingId ? 'Revise this window' : 'Add a trip'}
                    </h2>
                    {editingId ? (
                        <Button
                            size="compact-sm"
                            variant="subtle"
                            color="gray"
                            onClick={() => {
                                setEditingId(null);
                                setDraft(emptyDraft);
                                setFormError(null);
                            }}
                        >
                            Cancel
                        </Button>
                    ) : null}
                </div>
                <form
                    className={classes.form}
                    onSubmit={(event) => {
                        event.preventDefault();
                        saveDraft();
                    }}
                >
                    <TextInput
                        className={classes.nameField}
                        label="Name"
                        placeholder="Hawaii, Austin client week…"
                        value={draft.name}
                        onChange={(event) => {
                            patchDraft({ name: event.currentTarget.value });
                        }}
                    />
                    <TextInput
                        className={classes.locationField}
                        label="Destination"
                        placeholder="Nashville, TN"
                        description="Optional. Compared to the city on the bank import name."
                        value={draft.location}
                        onChange={(event) => {
                            patchDraft({ location: event.currentTarget.value });
                        }}
                    />
                    <label className={classes.field}>
                        <span className={classes.fieldLabel}>Kind</span>
                        <select
                            className={classes.select}
                            value={draft.kind}
                            onChange={(event) => {
                                const kind = event.currentTarget.value;
                                if (kind === 'vacation' || kind === 'work') {
                                    patchDraft({ kind });
                                }
                            }}
                        >
                            <option value="vacation">Vacation</option>
                            <option value="work">Work</option>
                        </select>
                    </label>
                    <DatePickerInput
                        className={classes.datesField}
                        type="range"
                        allowSingleDateInRange
                        clearable
                        numberOfColumns={2}
                        size="md"
                        label="Dates"
                        placeholder="Pick start and end"
                        valueFormat="MMM D, YYYY"
                        value={[draft.startDate || null, draft.endDate || null]}
                        onChange={(range) => {
                            patchDraft({
                                startDate: range[0] ?? '',
                                endDate: range[1] ?? '',
                            });
                        }}
                    />
                    <MultiSelect
                        className={classes.accountField}
                        label="Cards"
                        description="Leave empty to include every card."
                        placeholder="Every card"
                        data={accountSelectData()}
                        value={draft.accountIds}
                        searchable
                        clearable
                        onChange={(accountIds) => {
                            patchDraft({ accountIds });
                        }}
                    />
                    {formError ? <p className={classes.formError}>{formError}</p> : null}
                    <Button className={classes.save} type="submit" loading={saving}>
                        {editingId ? 'Save changes' : 'Add trip'}
                    </Button>
                </form>
            </section>
        </div>
    );
}

function monthLabel(isoDate: string): string {
    const date = parseIsoDate(isoDate);
    return date.toLocaleString('en-US', { month: 'short' }).toUpperCase();
}

function dayLabel(isoDate: string): string {
    return String(parseIsoDate(isoDate).getUTCDate()).padStart(2, '0');
}

function formatRange(startDate: string, endDate: string): string {
    const start = parseIsoDate(startDate);
    const end = parseIsoDate(endDate);
    const startText = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const endText = end.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
    });
    return `${startText} – ${endText}`;
}

function formatAccounts(accounts: ReadonlyArray<{ name: string }>): string {
    if (accounts.length === 0) {
        return 'Every card';
    }
    return accounts.map((account) => account.name).join(', ');
}

function parseIsoDate(isoDate: string): Date {
    return new Date(`${isoDate}T00:00:00Z`);
}
