import type { CSSVariablesResolver } from '@mantine/core';

export const cssVariablesResolver: CSSVariablesResolver = () => ({
    variables: {},
    dark: {
        '--app-bg-root': '#0b0e14',
        '--app-bg-surface': '#111620',
        '--app-text-primary': '#e8e8ed',
        '--app-text-secondary': '#8888a0',
    },
    light: {
        '--app-bg-root': '#f3f4f6',
        '--app-bg-surface': '#ffffff',
        '--app-text-primary': '#111122',
        '--app-text-secondary': '#555570',
    },
});
