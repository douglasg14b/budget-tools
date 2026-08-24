import { getHealthOptions } from '@budget-tools/web-sdk';
import { useQuery } from '@tanstack/react-query';

import classes from './NavbarHealthBadge.module.css';

export function NavbarHealthBadge() {
    const healthQuery = useQuery(getHealthOptions());

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
