import { getOperatingModeOptions } from '@budget-tools/web-sdk';
import { AppShell, MantineProvider } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import classes from './App.module.css';
import { AppNav } from './components/AppNav';
import { NavbarHealthBadge } from './components/NavbarHealthBadge';
import { OperatingModeToggle } from './components/OperatingModeToggle';
import { cssVariablesResolver } from './cssVariablesResolver';
import type { OperatingMode } from './operatingMode/operatingModeCopy';
import { ClassifyPage } from './pages/ClassifyPage';
import { ReviewQueuePage } from './pages/ReviewQueuePage';
import { TripsPage } from './pages/TripsPage';
import { theme } from './theme';

export function App() {
    return (
        <MantineProvider defaultColorScheme="dark" theme={theme} cssVariablesResolver={cssVariablesResolver}>
            <BrowserRouter>
                <AppLayout />
            </BrowserRouter>
        </MantineProvider>
    );
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
                            <OperatingModeToggle />
                            <NavbarHealthBadge />
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
                            <Route path="/trips" element={<TripsPage />} />
                        </Routes>
                    </div>
                </AppShell.Main>
            </AppShell>
        </div>
    );
}
