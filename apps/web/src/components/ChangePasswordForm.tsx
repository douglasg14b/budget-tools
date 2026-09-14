import { patchPasswordMutation } from '@budget-tools/web-sdk';
import { Alert, Button, PasswordInput } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import {
    changePasswordErrorMessage,
    changePasswordSuccessMessage,
    MIN_PASSWORD_LENGTH,
    validateChangePassword,
} from '../auth/changePassword';
import classes from './ChangePasswordForm.module.css';

/**
 * Re-authenticating password change, shaped like `LoginPage`'s credential form.
 *
 * A wrong current password comes back as a 403 rather than a 401 precisely so it lands in this
 * alert instead of tripping the global signed-out handler — the user stays signed in and can
 * simply retype. A success likewise keeps this session alive, so the form resets in place rather
 * than navigating anywhere.
 */
export function ChangePasswordForm() {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const mutation = useMutation(patchPasswordMutation());

    function submit(): void {
        if (mutation.isPending) {
            return;
        }
        setSuccess(null);

        const problem = validateChangePassword({ currentPassword, newPassword, confirmPassword });
        if (problem) {
            setError(problem);
            return;
        }
        setError(null);

        mutation
            .mutateAsync({ body: { currentPassword, newPassword } })
            .then((result) => {
                setSuccess(changePasswordSuccessMessage(result.revokedSessions));
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
            })
            .catch((cause: unknown) => {
                setError(changePasswordErrorMessage(cause));
            });
    }

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                submit();
            }}
        >
            <div className={classes.fields}>
                {error ? (
                    <Alert color="red" role="alert">
                        {error}
                    </Alert>
                ) : null}
                {success ? (
                    <Alert color="green" role="status">
                        {success}
                    </Alert>
                ) : null}
                <PasswordInput
                    label="Current password"
                    autoComplete="current-password"
                    required
                    size="md"
                    value={currentPassword}
                    onChange={(event) => {
                        setCurrentPassword(event.currentTarget.value);
                    }}
                />
                <PasswordInput
                    label="New password"
                    description={`At least ${MIN_PASSWORD_LENGTH} characters.`}
                    autoComplete="new-password"
                    required
                    size="md"
                    value={newPassword}
                    onChange={(event) => {
                        setNewPassword(event.currentTarget.value);
                    }}
                />
                <PasswordInput
                    label="Confirm new password"
                    autoComplete="new-password"
                    required
                    size="md"
                    value={confirmPassword}
                    onChange={(event) => {
                        setConfirmPassword(event.currentTarget.value);
                    }}
                />
                <Button className={classes.submit} type="submit" size="md" loading={mutation.isPending}>
                    Change password
                </Button>
            </div>
        </form>
    );
}
