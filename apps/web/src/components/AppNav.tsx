import { Menu, UnstyledButton } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';

import classes from './AppNav.module.css';
import { currentPrimaryNav, isPrimaryNavActive, navTarget, PRIMARY_NAV } from './primaryNav';

export function AppNav() {
    const location = useLocation();
    const navigate = useNavigate();
    const current = currentPrimaryNav(location.pathname);

    function goToSection(pathname: string): void {
        const item = PRIMARY_NAV.find((entry) => entry.pathname === pathname);
        if (!item) {
            return;
        }
        void navigate(navTarget(item, location.search));
    }

    return (
        <nav className={classes.nav} aria-label="Primary">
            <div className={classes.tabs}>
                {PRIMARY_NAV.map((item) => (
                    <NavLink
                        key={item.pathname}
                        className={navClassName}
                        end={item.end}
                        to={navTarget(item, location.search)}
                    >
                        {item.label}
                    </NavLink>
                ))}
            </div>
            <div className={classes.compact}>
                <Menu position="bottom-start" offset={6} withinPortal zIndex={500} width="target">
                    <Menu.Target>
                        <UnstyledButton className={classes.trigger} aria-label={`Current section: ${current.label}`}>
                            <span className={classes.current}>{current.label}</span>
                            <IconChevronDown size={14} className={classes.chevron} aria-hidden="true" />
                        </UnstyledButton>
                    </Menu.Target>
                    <Menu.Dropdown className={classes.menu}>
                        {PRIMARY_NAV.map((item) => {
                            const active = isPrimaryNavActive(location.pathname, item);
                            return (
                                <Menu.Item
                                    key={item.pathname}
                                    className={menuItemClassName(active)}
                                    onClick={() => {
                                        goToSection(item.pathname);
                                    }}
                                >
                                    {item.label}
                                </Menu.Item>
                            );
                        })}
                    </Menu.Dropdown>
                </Menu>
            </div>
        </nav>
    );
}

function navClassName({ isActive }: { isActive: boolean }): string {
    return isActive ? `${classes.link} ${classes.linkActive}` : classes.link;
}

function menuItemClassName(isActive: boolean): string {
    return isActive ? `${classes.menuItem} ${classes.menuItemActive}` : classes.menuItem;
}
