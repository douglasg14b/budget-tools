import { Menu, Modal, UnstyledButton } from '@mantine/core';
import { IconChevronDown, IconUser } from '@tabler/icons-react';
import { useState } from 'react';

import { useAuth } from '../auth/AuthContext';
import classes from './AccountMenu.module.css';
import { ChangePasswordForm } from './ChangePasswordForm';

/**
 * Signed-in identity plus sign-out, shaped like `AppNav`'s compact menu so the header reads as
 * one row of controls. Below 40rem the username collapses to an icon, matching how the nav and
 * wordmark shed text at the same breakpoint.
 */
export function AccountMenu() {
    const { user, logout, isLoggingOut } = useAuth();
    const [changingPassword, setChangingPassword] = useState(false);

    if (!user) {
        return null;
    }

    return (
        <>
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
                        onClick={() => {
                            setChangingPassword(true);
                        }}
                    >
                        Change password…
                    </Menu.Item>
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
            <Modal
                centered
                // Remounting per open discards any typed-but-unsubmitted password and any stale
                // success banner, so reopening never shows the previous attempt's state.
                key={changingPassword ? 'open' : 'closed'}
                opened={changingPassword}
                radius="md"
                size="26rem"
                title="Change password"
                classNames={{
                    overlay: classes.overlay,
                    content: classes.content,
                    header: classes.header,
                    title: classes.title,
                    body: classes.body,
                    close: classes.close,
                }}
                onClose={() => {
                    setChangingPassword(false);
                }}
            >
                <ChangePasswordForm />
            </Modal>
        </>
    );
}
