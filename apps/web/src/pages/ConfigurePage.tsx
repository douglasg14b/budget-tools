import { getOperatingModeOptions } from '@budget-tools/web-sdk';
import { Button, Modal } from '@mantine/core';
import type { Icon } from '@tabler/icons-react';
import { IconChevronRight, IconPlane, IconRepeat } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import { ApiHealthBadge } from '../components/ApiHealthBadge';
import { ChangePasswordForm } from '../components/ChangePasswordForm';
import { OperatingModeToggle } from '../components/OperatingModeToggle';
import { OutboundSyncChip } from '../components/OutboundSyncChip';
import type { OperatingMode } from '../operatingMode/operatingModeCopy';
import { operatingModeClassifyNote } from '../operatingMode/operatingModeCopy';
import classes from './ConfigurePage.module.css';

type SetupLink = {
    readonly to: string;
    readonly label: string;
    readonly detail: string;
    readonly icon: Icon;
};

const SETUP_LINKS: readonly SetupLink[] = [
    {
        to: '/repeating',
        label: 'Repeating',
        detail: 'Subscriptions, rent and other charges on a beat',
        icon: IconRepeat,
    },
    {
        to: '/trips',
        label: 'Trips',
        detail: 'Travel windows that bias categories while away',
        icon: IconPlane,
    },
];

/**
 * The phone's home for everything the desktop header and nav carry but a bottom tab bar has no
 * room for: setup screens, the Practice / Live switch, sync and API status, and the account.
 */
export function ConfigurePage() {
    const modeQuery = useQuery(getOperatingModeOptions());
    const mode: OperatingMode = modeQuery.data?.mode ?? 'practice';

    return (
        <div className={classes.page}>
            <h1 className={classes.title}>Configure</h1>

            <section className={classes.section} aria-labelledby="configure-setup">
                <h2 id="configure-setup" className={classes.sectionTitle}>
                    Setup
                </h2>
                <ul className={classes.links}>
                    {SETUP_LINKS.map((link) => {
                        const LinkIcon = link.icon;
                        return (
                            <li key={link.to}>
                                <Link className={classes.link} to={link.to}>
                                    <LinkIcon size={20} className={classes.linkIcon} aria-hidden="true" />
                                    <span className={classes.linkCopy}>
                                        <span className={classes.linkLabel}>{link.label}</span>
                                        <span className={classes.linkDetail}>{link.detail}</span>
                                    </span>
                                    <IconChevronRight size={18} className={classes.chevron} aria-hidden="true" />
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </section>

            <section className={classes.section} aria-labelledby="configure-mode">
                <h2 id="configure-mode" className={classes.sectionTitle}>
                    Mode
                </h2>
                <div className={classes.row}>
                    <p className={classes.note} data-mode={mode}>
                        {operatingModeClassifyNote(mode)}
                    </p>
                    <OperatingModeToggle />
                </div>
            </section>

            <section className={classes.section} aria-labelledby="configure-status">
                <h2 id="configure-status" className={classes.sectionTitle}>
                    Status
                </h2>
                <div className={classes.row}>
                    <ApiHealthBadge />
                    <OutboundSyncChip />
                </div>
            </section>

            <section className={classes.section} aria-labelledby="configure-account">
                <h2 id="configure-account" className={classes.sectionTitle}>
                    Account
                </h2>
                <AccountRow />
            </section>
        </div>
    );
}

/** The header's account menu, laid flat: a phone has the room for real buttons here. */
function AccountRow() {
    const { user, logout, isLoggingOut } = useAuth();
    const [changingPassword, setChangingPassword] = useState(false);

    if (!user) {
        return null;
    }

    return (
        <div className={classes.row}>
            <p className={classes.note}>Signed in as {user.username}</p>
            <div className={classes.accountActions}>
                <Button
                    variant="default"
                    onClick={() => {
                        setChangingPassword(true);
                    }}
                >
                    Change password
                </Button>
                <Button
                    variant="subtle"
                    color="gray"
                    loading={isLoggingOut}
                    onClick={() => {
                        void logout();
                    }}
                >
                    Log out
                </Button>
            </div>
            <Modal
                centered
                // Remount per open so a reopened form never shows the previous attempt.
                key={changingPassword ? 'open' : 'closed'}
                opened={changingPassword}
                title="Change password"
                onClose={() => {
                    setChangingPassword(false);
                }}
            >
                <ChangePasswordForm />
            </Modal>
        </div>
    );
}
