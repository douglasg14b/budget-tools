import { Alert, Button } from '@mantine/core';

import { ApiHealthBadge, PRE_LOGIN_HEALTH_RECHECK_MS } from '../components/ApiHealthBadge';
import classes from './LoginPage.module.css';

type ApiUnreachablePageProps = {
    /** Why the sign-in check failed, for anyone who wants more than the headline. */
    readonly detail: string | null;
    readonly onRetry: () => void;
};

/**
 * Shown instead of the login form when the sign-in check got no answer at all.
 *
 * The login form here would be a lie: the session cookie may be perfectly good, and a signed-in
 * user would type credentials that cannot help. The copy stays careful not to promise they ARE
 * signed in either — the cookie is HttpOnly, so until the API answers there is no way to know.
 * The sign-in check re-runs in the background, so this screen clears itself when the API is back.
 */
export function ApiUnreachablePage({ detail, onRetry }: ApiUnreachablePageProps) {
    return (
        <div className={classes.screen}>
            <div className={classes.atmosphere} aria-hidden="true" />
            <main className={classes.card}>
                <span className={classes.wordmark}>Budget Tools</span>
                <p className={classes.lede}>Can't reach the server right now. Retrying automatically.</p>
                <div className={classes.actions}>
                    <Alert color="yellow" title="No need to sign in again" role="status" w="100%">
                        If you were signed in, you most likely still are. This page will continue as soon as the server
                        answers.
                    </Alert>
                    {detail ? <p className={classes.detail}>{detail}</p> : null}
                    <Button variant="light" size="sm" onClick={onRetry}>
                        Try now
                    </Button>
                </div>
                <div className={classes.footer}>
                    <ApiHealthBadge refetchInterval={PRE_LOGIN_HEALTH_RECHECK_MS} />
                </div>
            </main>
        </div>
    );
}
