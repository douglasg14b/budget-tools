import { AppShell, MantineProvider, NavLink, Text } from '@mantine/core';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { cssVariablesResolver } from './cssVariablesResolver';
import { HomePage } from './pages/HomePage';
import { theme } from './theme';

export function App() {
    return (
        <MantineProvider defaultColorScheme="dark" theme={theme} cssVariablesResolver={cssVariablesResolver}>
            <BrowserRouter>
                <AppShell
                    navbar={{ width: 220, breakpoint: 'sm' }}
                    padding="md"
                    styles={{
                        main: {
                            backgroundColor: 'var(--app-bg-root)',
                        },
                        navbar: {
                            backgroundColor: 'var(--app-bg-surface)',
                        },
                    }}
                >
                    <AppShell.Navbar p="md">
                        <Text fw={700} mb="md">
                            Budget Tools
                        </Text>
                        <NavLink label="Home" href="/" active />
                        <NavLink label="Review" href="#" disabled description="Coming soon" />
                    </AppShell.Navbar>
                    <AppShell.Main>
                        <Routes>
                            <Route path="/" element={<HomePage />} />
                        </Routes>
                    </AppShell.Main>
                </AppShell>
            </BrowserRouter>
        </MantineProvider>
    );
}
