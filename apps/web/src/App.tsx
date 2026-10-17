import { getOperatingModeOptions } from '@budget-tools/web-sdk';
import { Alert, AppShell, Button, Loader, MantineProvider, Stack } from '@mantine/core';
import { IconChevronLeft } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import classes from './App.module.css';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { diagnoseAuthStall } from './auth/authStallDiagnosis';
import { useStallTimeout } from './auth/useStallTimeout';
import { AccountMenu } from './components/AccountMenu';
import { ApiHealthBadge } from './components/ApiHealthBadge';
import { AppNav } from './components/AppNav';
import { AppUpdatePrompt } from './components/AppUpdatePrompt';
import { MobileTabBar } from './components/MobileTabBar';
import { OperatingModeToggle } from './components/OperatingModeToggle';
import { OutboundSyncChip } from './components/OutboundSyncChip';
import { currentMobileTab } from './components/primaryNav';
import { PracticeReceiptsProvider } from './components/review/classify/PracticeReceiptsContext';
import { MobileReviewPage } from './components/review/mobile/MobileReviewPage';
import { useIsNarrow } from './components/useIsNarrow';
import { cssVariablesResolver } from './cssVariablesResolver';
import type { OperatingMode } from './operatingMode/operatingModeCopy';
import { ApiUnreachablePage } from './pages/ApiUnreachablePage';
import { ClassifyPage } from './pages/ClassifyPage';
import { ConfigurePage } from './pages/ConfigurePage';
import { LoginPage } from './pages/LoginPage';
import { ReceiptDetailPage } from './pages/ReceiptDetailPage';
import { ReceiptsPage } from './pages/ReceiptsPage';
import { RepeatingPage } from './pages/RepeatingPage';
import { ReviewQueuePage } from './pages/ReviewQueuePage';
import { SpendingPage } from './pages/SpendingPage';
import { TripsPage } from './pages/TripsPage';
import { theme } from './theme';

export function App() {
    return (
        <MantineProvider defaultColorScheme="dark" theme={theme} cssVariablesResolver={cssVariablesResolver}>
            {/*
              No Suspense anywhere, so transitions buy nothing: they only queue a navigation behind
              other renders, and a tap on a busy list (scores landing, rows scrolling) felt dead.
            */}
            <BrowserRouter useTransitions={false}>
                <AuthProvider>
                    <PracticeReceiptsProvider>
                        <AuthGate />
                    </PracticeReceiptsProvider>
                </AuthProvider>
            </BrowserRouter>
            {/* Outside AuthGate so a stale bundle can be replaced from the login or stalled-auth screens too. */}
            <AppUpdatePrompt />
        </MantineProvider>
    );
}

/**
 * Chooses between the signed-out and signed-in trees.
 *
 * `AppLayout` is not merely hidden while anonymous — it is not mounted at all, so the queries its
 * children own (operating mode, health, outbound sync) never fire without a session and cannot
 * trip the global 401 handler on their own.
 */
function AuthGate() {
    const { status, stallState, retry } = useAuth();
    const hasStalled = useStallTimeout(status === 'loading');

    if (status === 'loading') {
        // Past the deadline the spinner has stopped being informative — it looks identical whether
        // the server is slow or the request will never settle at all. Say which, and offer a way out.
        if (hasStalled) {
            const diagnosis = diagnoseAuthStall(stallState);
            return (
                <div className={classes.splash}>
                    <Alert color="yellow" title={diagnosis.summary} role="alert" maw={440}>
                        <Stack gap="sm" align="flex-start">
                            <span>{diagnosis.detail}</span>
                            <Button size="xs" variant="light" onClick={retry}>
                                Try again
                            </Button>
                        </Stack>
                    </Alert>
                </div>
            );
        }

        // A neutral pane rather than the login card: on refresh the `getMe` round trip is short,
        // and rendering the form first would flash a login screen at an already-signed-in user.
        return (
            <div className={classes.splash}>
                <Loader color="sage" type="dots" />
                <span className={classes.splashLabel}>Loading…</span>
            </div>
        );
    }

    if (status === 'unreachable') {
        return <ApiUnreachablePage detail={stallState.errorMessage} onRetry={retry} />;
    }

    if (status === 'anonymous') {
        return <LoginPage />;
    }

    return <AppLayout />;
}

function AppLayout() {
    const modeQuery = useQuery(getOperatingModeOptions());
    const mode: OperatingMode = modeQuery.data?.mode ?? 'practice';
    const isNarrow = useIsNarrow();

    return (
        <div className={classes.frame} data-mode={mode}>
            {isNarrow ? <MobileLayout mode={mode} /> : <DesktopLayout mode={mode} />}
        </div>
    );
}

type LayoutProps = {
    mode: OperatingMode;
};

function DesktopLayout({ mode }: LayoutProps) {
    return (
        <AppShell header={{ height: 60 }} padding={0} classNames={{ header: classes.header, main: classes.main }}>
            <AppShell.Header withBorder={false}>
                <div className={classes.headerInner}>
                    <div className={classes.brand}>
                        <span className={classes.wordmark}>Budget Tools</span>
                        {mode === 'live' ? (
                            <span className={classes.liveStamp} aria-hidden="true">
                                Live
                            </span>
                        ) : null}
                        <AppNav />
                    </div>
                    <div className={classes.headerEnd}>
                        <OutboundSyncChip />
                        <OperatingModeToggle />
                        <ApiHealthBadge />
                        <AccountMenu />
                    </div>
                </div>
            </AppShell.Header>
            <AppShell.Main>
                <div className={classes.atmosphere} aria-hidden="true" />
                <div className={classes.page}>
                    <Routes>
                        <Route path="/" element={<ReviewQueuePage />} />
                        <Route path="/classify" element={<ClassifyPage layout="card" />} />
                        <Route path="/classify/table" element={<ClassifyPage layout="table" />} />
                        <Route path="/configure" element={<ConfigurePage />} />
                        {sharedRoutes()}
                    </Routes>
                </div>
            </AppShell.Main>
        </AppShell>
    );
}

/**
 * Phone shell: no header, a bottom tab bar, and Review standing in for Queue, Classify and Table.
 * The header's mode switch, sync and account controls move to Configure.
 */
function MobileLayout({ mode }: LayoutProps) {
    const location = useLocation();
    const underConfigure = currentMobileTab(location.pathname).id === 'configure' && location.pathname !== '/configure';

    return (
        <div className={classes.mobileShell}>
            <div className={classes.atmosphere} aria-hidden="true" />
            <main className={classes.mobilePage}>
                {underConfigure ? (
                    <Link className={classes.backLink} to="/configure">
                        <IconChevronLeft size={18} aria-hidden="true" />
                        Configure
                    </Link>
                ) : null}
                <Routes>
                    {/* One mount for list and card, so both share a session. */}
                    <Route element={<MobileReviewPage />}>
                        <Route path="/" element={null} />
                        <Route path="/classify" element={null} />
                    </Route>
                    <Route path="/classify/table" element={<Navigate replace to="/" />} />
                    <Route path="/configure" element={<ConfigurePage />} />
                    {sharedRoutes()}
                </Routes>
            </main>
            <MobileTabBar live={mode === 'live'} />
        </div>
    );
}

function sharedRoutes() {
    return (
        <>
            <Route path="/receipts" element={<ReceiptsPage />} />
            <Route path="/receipts/:receiptId" element={<ReceiptDetailPage />} />
            <Route path="/repeating" element={<RepeatingPage />} />
            <Route path="/trips" element={<TripsPage />} />
            <Route path="/spending" element={<SpendingPage />} />
            {/*
              Anything else goes home rather than rendering a blank page. Unknown paths do reach the
              app: the service worker and nginx both fall back to index.html, and an installed app can
              reopen whatever URL it was last left on, e.g. the Cloudflare Access callback.
            */}
            <Route path="*" element={<Navigate replace to="/" />} />
        </>
    );
}
