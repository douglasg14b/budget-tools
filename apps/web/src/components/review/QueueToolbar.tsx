import { Button, Tooltip } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';

import classes from './QueueToolbar.module.css';

type QueueToolbarProps = {
    generatedAt: string | undefined;
    isRefreshing: boolean;
    onRefresh: () => void;
    refreshDisabled: boolean;
    visibleCount: number | undefined;
    totalCount: number | undefined;
};

export function QueueToolbar({
    generatedAt,
    isRefreshing,
    onRefresh,
    refreshDisabled,
    totalCount,
    visibleCount,
}: QueueToolbarProps) {
    const countLabel =
        visibleCount !== undefined && totalCount !== undefined && visibleCount !== totalCount
            ? `${visibleCount} of ${totalCount}`
            : undefined;

    return (
        <div className={classes.toolbar}>
            <div className={classes.copy}>
                <h1 className={classes.title}>Queue</h1>
                <div className={classes.meta}>
                    {generatedAt ? (
                        <Tooltip label={new Date(generatedAt).toLocaleString()}>
                            <p className={classes.metaItem}>{formatScoredAt(generatedAt)}</p>
                        </Tooltip>
                    ) : (
                        <p className={classes.metaItem}>Pending transactions with AI category suggestions</p>
                    )}
                    {countLabel ? <p className={`${classes.metaItem} ${classes.count}`}>{countLabel}</p> : null}
                </div>
            </div>
            <div className={classes.actions}>
                <Button
                    className={classes.refresh}
                    variant="subtle"
                    color="gray"
                    size="compact-md"
                    leftSection={<IconRefresh size={18} />}
                    loading={isRefreshing}
                    disabled={refreshDisabled}
                    onClick={onRefresh}
                >
                    Refresh predictions
                </Button>
            </div>
        </div>
    );
}

function formatScoredAt(generatedAt: string): string {
    const then = new Date(generatedAt);
    const deltaMinutes = Math.round((then.getTime() - Date.now()) / 60_000);
    const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'always' });
    if (Math.abs(deltaMinutes) < 1) {
        return 'Scored just now';
    }
    if (Math.abs(deltaMinutes) < 60) {
        return `Scored ${formatter.format(deltaMinutes, 'minute')}`;
    }
    const deltaHours = Math.round(deltaMinutes / 60);
    if (Math.abs(deltaHours) < 24) {
        return `Scored ${formatter.format(deltaHours, 'hour')}`;
    }
    const deltaDays = Math.round(deltaHours / 24);
    return `Scored ${formatter.format(deltaDays, 'day')}`;
}
