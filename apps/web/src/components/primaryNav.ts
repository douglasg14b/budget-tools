export type PrimaryNavItem = {
    readonly label: string;
    readonly pathname: string;
    readonly end?: boolean;
    readonly keepSearch?: boolean;
};

const QUEUE_NAV: PrimaryNavItem = { label: 'Queue', pathname: '/', end: true, keepSearch: true };

export const PRIMARY_NAV: readonly PrimaryNavItem[] = [
    QUEUE_NAV,
    // Covers /classify/table too: card vs table is a toggle on the page, not a separate section.
    { label: 'Classify', pathname: '/classify', keepSearch: true },
    { label: 'Receipts', pathname: '/receipts', keepSearch: true },
    { label: 'Repeating', pathname: '/repeating' },
    { label: 'Trips', pathname: '/trips' },
    { label: 'Spending', pathname: '/spending' },
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

export type MobileTabId = 'review' | 'receipts' | 'spending' | 'configure';

export type MobileTab = {
    readonly id: MobileTabId;
    readonly label: string;
    readonly pathname: string;
    /** Other sections that live under this tab on a phone. */
    readonly owns: readonly string[];
};

const REVIEW_TAB: MobileTab = { id: 'review', label: 'Review', pathname: '/', owns: ['/classify'] };

/**
 * Bottom tab bar on a phone. Queue, Classify and Table collapse into Review; Repeating and Trips
 * are setup screens reached from Configure.
 */
export const MOBILE_TABS: readonly MobileTab[] = [
    REVIEW_TAB,
    { id: 'receipts', label: 'Receipts', pathname: '/receipts', owns: [] },
    { id: 'spending', label: 'Spending', pathname: '/spending', owns: [] },
    { id: 'configure', label: 'Configure', pathname: '/configure', owns: ['/repeating', '/trips'] },
];

export function isMobileTabActive(pathname: string, tab: MobileTab): boolean {
    if (tab.pathname === '/' ? pathname === '/' : matchesSection(pathname, tab.pathname)) {
        return true;
    }
    return tab.owns.some((section) => matchesSection(pathname, section));
}

export function currentMobileTab(pathname: string): MobileTab {
    return MOBILE_TABS.find((tab) => isMobileTabActive(pathname, tab)) ?? REVIEW_TAB;
}

function matchesSection(pathname: string, section: string): boolean {
    return pathname === section || pathname.startsWith(`${section}/`);
}
