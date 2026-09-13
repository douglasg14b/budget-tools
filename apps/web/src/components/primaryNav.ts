export type PrimaryNavItem = {
    readonly label: string;
    readonly pathname: string;
    readonly end?: boolean;
    readonly keepSearch?: boolean;
};

const QUEUE_NAV: PrimaryNavItem = { label: 'Queue', pathname: '/', end: true, keepSearch: true };

export const PRIMARY_NAV: readonly PrimaryNavItem[] = [
    QUEUE_NAV,
    { label: 'Classify', pathname: '/classify', end: true, keepSearch: true },
    { label: 'Table', pathname: '/classify/table', end: true, keepSearch: true },
    { label: 'Receipts', pathname: '/receipts', keepSearch: true },
    { label: 'Repeating', pathname: '/repeating' },
    { label: 'Trips', pathname: '/trips' },
];

export function navTarget(
    item: PrimaryNavItem,
    search: string,
): string | { readonly pathname: string; readonly search: string } {
    return item.keepSearch ? { pathname: item.pathname, search } : item.pathname;
}

export function isPrimaryNavActive(pathname: string, item: PrimaryNavItem): boolean {
    if (item.end) {
        return pathname === item.pathname;
    }
    return pathname === item.pathname || pathname.startsWith(`${item.pathname}/`);
}

export function currentPrimaryNav(pathname: string): PrimaryNavItem {
    return PRIMARY_NAV.find((item) => isPrimaryNavActive(pathname, item)) ?? QUEUE_NAV;
}
