import { Select } from '@mantine/core';

import classes from './QueueFilters.module.css';

export type AccountOption = {
    id: string;
    name: string;
};

type QueueFiltersProps = {
    accountId: string | undefined;
    accounts: AccountOption[];
    onAccountIdChange: (accountId: string | undefined) => void;
};

export function QueueFilters({ accountId, accounts, onAccountIdChange }: QueueFiltersProps) {
    const data = accounts.map((account) => ({ value: account.id, label: account.name }));
    const hasUnknownAccount = Boolean(accountId && !accounts.some((account) => account.id === accountId));
    if (accountId && hasUnknownAccount) {
        data.push({ value: accountId, label: accountId });
    }

    return (
        <Select
            className={classes.select}
            clearable
            data={data}
            label="Account"
            placeholder="All accounts"
            value={accountId ?? null}
            onChange={(value) => {
                onAccountIdChange(value ?? undefined);
            }}
        />
    );
}
