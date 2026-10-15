import { getHealthOptions } from '@budget-tools/web-sdk';
import { useQuery } from '@tanstack/react-query';

import classes from './ApiHealthBadge.module.css';

/** Pre-login screens poll health so the badge tracks the API coming and going while they sit open. */
export const PRE_LOGIN_HEALTH_RECHECK_MS = 10_000;

type ApiHealthBadgeProps = {
    /**
     * Re-checks on this interval. Screens shown *because* the API may be down need it, or the
     * badge would keep reporting the first answer it got.
     */
    readonly refetchInterval?: number;
};

export function ApiHealthBadge({ refetchInterval }: ApiHealthBadgeProps) {
    const healthQuery = useQuery({
        ...getHealthOptions(),
        // When polling, the next tick is the retry; the default backoff would only hold the badge
        // on "Checking API…" for its whole duration. Without polling, keep the retries so a single
        // blip does not leave the badge stuck on "unreachable".
        ...(refetchInterval === undefined ? {} : { refetchInterval, retry: false }),
    });

    if (healthQuery.isPending) {
        return <span className={classes.status}>Checking API…</span>;
    }

    if (healthQuery.isError) {
        return (
            <span className={classes.status}>
                <span className={classes.dot} data-state="error" />
                <span className={classes.label}>API unreachable</span>
            </span>
        );
    }

    return (
        <span className={classes.status}>
            <span className={classes.dot} data-state={healthQuery.data.ok ? 'ok' : 'error'} />
            <span className={classes.label}>API {healthQuery.data.ok ? 'ok' : 'unhealthy'}</span>
        </span>
    );
}
