import type { Icon } from '@tabler/icons-react';
import { IconAdjustmentsHorizontal, IconChartBar, IconListCheck, IconReceipt } from '@tabler/icons-react';
import { Link, useLocation } from 'react-router-dom';

import classes from './MobileTabBar.module.css';
import type { MobileTabId } from './primaryNav';
import { isMobileTabActive, MOBILE_TABS } from './primaryNav';

const TAB_ICONS: Record<MobileTabId, Icon> = {
    review: IconListCheck,
    receipts: IconReceipt,
    spending: IconChartBar,
    configure: IconAdjustmentsHorizontal,
};

type MobileTabBarProps = {
    /** Live mode marks Configure, where the mode switch now lives. */
    live: boolean;
};

export function MobileTabBar({ live }: MobileTabBarProps) {
    const location = useLocation();

    return (
        <nav className={classes.bar} aria-label="Primary">
            {MOBILE_TABS.map((tab) => {
                const TabIcon = TAB_ICONS[tab.id];
                const active = isMobileTabActive(location.pathname, tab);
                return (
                    <Link
                        key={tab.id}
                        className={classes.tab}
                        data-active={active || undefined}
                        aria-current={active ? 'page' : undefined}
                        to={tab.pathname}
                    >
                        <span className={classes.iconWrap}>
                            <TabIcon size={22} stroke={active ? 2.1 : 1.7} aria-hidden="true" />
                            {tab.id === 'configure' && live ? (
                                <span className={classes.liveDot} title="Live mode" />
                            ) : null}
                        </span>
                        <span className={classes.label}>
                            {tab.label}
                            {tab.id === 'configure' && live ? (
                                <span className={classes.srOnly}> (Live mode)</span>
                            ) : null}
                        </span>
                    </Link>
                );
            })}
        </nav>
    );
}
