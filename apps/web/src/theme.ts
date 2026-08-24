import type { MantineColorsTuple } from '@mantine/core';
import { createTheme } from '@mantine/core';

const sage: MantineColorsTuple = [
    '#f3f6f0',
    '#e3eadc',
    '#c7d4bb',
    '#a8be96',
    '#8da978',
    '#789464',
    '#647c54',
    '#526646',
    '#425239',
    '#333f2d',
];

export const theme = createTheme({
    fontFamily: 'Atkinson Hyperlegible, system-ui, sans-serif',
    fontFamilyMonospace: 'IBM Plex Mono, ui-monospace, SFMono-Regular, monospace',
    fontSizes: {
        xs: '0.875rem',
        sm: '0.9375rem',
        md: '1.0625rem',
        lg: '1.1875rem',
        xl: '1.375rem',
    },
    headings: {
        fontFamily: 'Atkinson Hyperlegible, system-ui, sans-serif',
        fontWeight: '700',
        sizes: {
            h1: { fontSize: '2.15rem', lineHeight: '1.2' },
        },
    },
    primaryColor: 'sage',
    primaryShade: { light: 6, dark: 5 },
    colors: {
        sage,
    },
    defaultRadius: 'sm',
    cursorType: 'pointer',
    components: {
        Badge: {
            defaultProps: {
                tt: 'none',
                fw: 700,
            },
        },
        Button: {
            defaultProps: {
                fw: 700,
            },
        },
        Select: {
            defaultProps: {
                size: 'md',
            },
        },
        Switch: {
            defaultProps: {
                size: 'md',
            },
        },
        Tooltip: {
            defaultProps: {
                withArrow: true,
                openDelay: 300,
                multiline: true,
                maw: 280,
                events: { hover: true, focus: true, touch: true },
            },
        },
    },
});
