import { getOutboundSyncOptions, getOutboundSyncQueryKey, postOutboundSyncFlushMutation } from '@budget-tools/web-sdk';
import { Popover } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getBackendErrorMessage } from './BackendErrorNotice';
import classes from './OutboundSyncChip.module.css';

export function OutboundSyncChip() {
    const queryClient = useQueryClient();
    const statusQuery = useQuery({
        ...getOutboundSyncOptions(),
        refetchInterval: (query) => {
            const data = query.state.data;
            if (!data) {
                return 15_000;
            }
            return data.pendingCount + data.syncingCount > 0 ? 8_000 : 30_000;
        },
        refetchOnWindowFocus: true,
    });
    const flushMutation = useMutation({
        ...postOutboundSyncFlushMutation(),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: getOutboundSyncQueryKey() });
        },
    });

    const data = statusQuery.data;
    const queued = (data?.pendingCount ?? 0) + (data?.syncingCount ?? 0);
    const failed = data?.failedCount ?? 0;
    const visible = queued > 0 || failed > 0;
    if (!visible && !statusQuery.isError) {
        return null;
    }

    const tone = failed > 0 || statusQuery.isError ? 'failed' : queued > 0 ? 'pending' : 'idle';
    const label = failed > 0 ? `${failed} failed` : queued > 0 ? `${queued} to YNAB` : 'YNAB queue';

    return (
        <Popover position="bottom-end" shadow="md" width={280}>
            <Popover.Target>
                <button className={classes.chip} type="button" data-tone={tone} aria-label="YNAB outbound sync">
                    <span className={classes.pulse} aria-hidden="true" />
                    <span className={classes.label}>{statusQuery.isError ? 'Sync error' : label}</span>
                </button>
            </Popover.Target>
            <Popover.Dropdown className={classes.dropdown}>
                <p className={classes.title}>YNAB write queue</p>
                {statusQuery.isError ? (
                    <p className={classes.error}>{getBackendErrorMessage(statusQuery.error)}</p>
                ) : (
                    <dl className={classes.counts}>
                        <div>
                            <dt>Queued</dt>
                            <dd>{data?.pendingCount ?? 0}</dd>
                        </div>
                        <div>
                            <dt>Sending</dt>
                            <dd>{data?.syncingCount ?? 0}</dd>
                        </div>
                        <div>
                            <dt>Waiting on bank feed</dt>
                            <dd>{data?.syncedUnconfirmedCount ?? 0}</dd>
                        </div>
                        <div>
                            <dt>Failed</dt>
                            <dd>{data?.failedCount ?? 0}</dd>
                        </div>
                    </dl>
                )}
                {data?.lastError ? <p className={classes.error}>{data.lastError}</p> : null}
                <button
                    className={classes.flush}
                    type="button"
                    disabled={flushMutation.isPending || queued === 0}
                    onClick={() => {
                        flushMutation.mutate({});
                    }}
                >
                    {flushMutation.isPending ? 'Flushing…' : 'Flush now'}
                </button>
                {flushMutation.isError ? (
                    <p className={classes.error}>{getBackendErrorMessage(flushMutation.error)}</p>
                ) : null}
            </Popover.Dropdown>
        </Popover>
    );
}
