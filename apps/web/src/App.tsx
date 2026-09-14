import { getOperatingModeOptions } from '@budget-tools/web-sdk';
import { AppShell, Loader, MantineProvider } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import classes from './App.module.css';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { AccountMenu } from './components/AccountMenu';
import { AppNav } from './components/AppNav';
import { NavbarHealthBadge } from './components/NavbarHealthBadge';
import { OperatingModeToggle } from './components/OperatingModeToggle';
import { OutboundSyncChip } from './components/OutboundSyncChip';
import { PracticeReceiptsProvider } from './components/review/classify/PracticeReceiptsContext';
import { cssVariablesResolver } from './cssVariablesResolver';
import type { OperatingMode } from './operatingMode/operatingModeCopy';
import { ClassifyPage } from './pages/ClassifyPage';
import { LoginPage } from './pages/LoginPage';
import { ReceiptDetailPage } from './pages/ReceiptDetailPage';
import { ReceiptsPage } from './pages/ReceiptsPage';
import { RepeatingPage } from './pages/RepeatingPage';
import { ReviewQueuePage } from './pages/ReviewQueuePage';
import { TripsPage } from './pages/TripsPage';
import { theme } from './theme';

export function App() {
    return (
        <MantineProvider defaultColorScheme="dark" theme={theme} cssVariablesResolver={cssVariablesResolver}>
            <BrowserRouter>
                <AuthProvider>
                    <PracticeReceiptsProvider>
                        <AuthGate />
                    </PracticeReceiptsProvider>
                </AuthProvider>
            </BrowserRouter>
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
    const { status } = useAuth();

    if (status === 'loading') {
        // A neutral pane rather than the login card: on refresh the `getMe` round trip is short,
        // and rendering the form first would flash a login screen at an already-signed-in user.
        return (
            <div className={classes.splash}>
                <Loader color="sage" type="dots" />
                <span className={classes.splashLabel}>Loading…</span>
            </div>
        );
    }

    if (status === 'anonymous') {
        return <LoginPage />;
    }

    return <AppLayout />;
}

function AppLayout() {
    const modeQuery = useQuery(getOperatingModeOptions());
    const mode: OperatingMode = modeQuery.data?.mode ?? 'practice';

    return (
        <div className={classes.frame} data-mode={mode}>
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
                            <NavbarHealthBadge />
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
                            <Route path="/receipts" element={<ReceiptsPage />} />
                            <Route path="/receipts/:receiptId" element={<ReceiptDetailPage />} />
                            <Route path="/repeating" element={<RepeatingPage />} />
                            <Route path="/trips" element={<TripsPage />} />
                        </Routes>
                    </div>
                </AppShell.Main>
            </AppShell>
        </div>
    );
}
