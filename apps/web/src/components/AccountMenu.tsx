import { Menu, UnstyledButton } from '@mantine/core';
import { IconChevronDown, IconUser } from '@tabler/icons-react';

import { useAuth } from '../auth/AuthContext';
import classes from './AccountMenu.module.css';

/**
 * Signed-in identity plus sign-out, shaped like `AppNav`'s compact menu so the header reads as
 * one row of controls. Below 40rem the username collapses to an icon, matching how the nav and
 * wordmark shed text at the same breakpoint.
 */
export function AccountMenu() {
    const { user, logout, isLoggingOut } = useAuth();

    if (!user) {
        return null;
    }

    return (
        <Menu position="bottom-end" offset={6} withinPortal zIndex={500}>
            <Menu.Target>
                <UnstyledButton className={classes.trigger} aria-label={`Account: ${user.username}`}>
                    <IconUser size={16} className={classes.avatar} aria-hidden="true" />
                    <span className={classes.username}>{user.username}</span>
                    <IconChevronDown size={14} className={classes.chevron} aria-hidden="true" />
                </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown className={classes.menu}>
                <Menu.Label className={classes.menuLabel}>Signed in as {user.username}</Menu.Label>
                <Menu.Item
                    className={classes.menuItem}
                    disabled={isLoggingOut}
                    onClick={() => {
                        void logout();
                    }}
                >
                    {isLoggingOut ? 'Signing out…' : 'Log out'}
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
}
