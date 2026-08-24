import { AppShell, MantineProvider } from '@mantine/core';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import classes from './App.module.css';
import { AppNav } from './components/AppNav';
import { NavbarHealthBadge } from './components/NavbarHealthBadge';
import { cssVariablesResolver } from './cssVariablesResolver';
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
    return (
        <AppShell header={{ height: 60 }} padding={0} classNames={{ header: classes.header, main: classes.main }}>
            <AppShell.Header withBorder={false}>
                <div className={classes.headerInner}>
                    <div className={classes.brand}>
                        <span className={classes.wordmark}>Budget Tools</span>
                        <AppNav />
                    </div>
                    <NavbarHealthBadge />
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
    );
}
