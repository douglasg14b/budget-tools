import '@fontsource-variable/inter';
import '@fontsource/jetbrains-mono';
import '@mantine/core/styles.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { configureApiClient } from './configureApiClient';

const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error('Missing #root element');
}

configureApiClient();

const queryClient = new QueryClient();

createRoot(rootElement).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <App />
        </QueryClientProvider>
    </StrictMode>,
);
