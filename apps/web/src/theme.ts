import type { MantineColorsTuple } from '@mantine/core';
import { createTheme } from '@mantine/core';

const accent: MantineColorsTuple = [
    '#e8f4fb',
    '#c8e2f3',
    '#a4cfe9',
    '#7fbce0',
    '#6db3e0',
    '#4a9fd4',
    '#3d8abf',
    '#3580b0',
    '#2a6a94',
    '#1f5378',
];

export const theme = createTheme({
    fontFamily: 'Inter Variable, Inter, system-ui, -apple-system, sans-serif',
    fontFamilyMonospace: 'JetBrains Mono, ui-monospace, SFMono-Regular, monospace',
    primaryColor: 'accent',
    colors: {
        accent,
    },
    defaultRadius: 'md',
});
