import { useMediaQuery } from '@mantine/hooks';

/** Phone layout breakpoint. Keep in sync with the `max-width: 56rem` media queries in CSS. */
export const NARROW_VIEWPORT = '(max-width: 56rem)';

/** True on phones, read synchronously so the first paint already picks the right shell. */
export function useIsNarrow(): boolean {
    return useMediaQuery(NARROW_VIEWPORT, false, { getInitialValueInEffect: false });
}
