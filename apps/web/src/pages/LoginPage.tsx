import { Alert, Button, PasswordInput, TextInput } from '@mantine/core';
import { useState } from 'react';

import { useAuth } from '../auth/AuthContext';
import { loginErrorMessage } from '../auth/loginErrorMessage';
import classes from './LoginPage.module.css';

export function LoginPage() {
    const { login, isLoggingIn } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);

    function submit(): void {
        if (isLoggingIn) {
            return;
        }
        setError(null);
        login({ username, password }).catch((cause: unknown) => {
            setError(loginErrorMessage(cause));
            setPassword('');
        });
    }

    return (
        <div className={classes.screen}>
            <div className={classes.atmosphere} aria-hidden="true" />
            <main className={classes.card}>
                <span className={classes.wordmark}>Budget Tools</span>
                <p className={classes.lede}>Sign in to review and classify your transactions.</p>
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
                        <TextInput
                            label="Username"
                            autoComplete="username"
                            autoFocus
                            required
                            size="md"
                            value={username}
                            onChange={(event) => {
                                setUsername(event.currentTarget.value);
                            }}
                        />
                        <PasswordInput
                            label="Password"
                            autoComplete="current-password"
                            required
                            size="md"
                            value={password}
                            onChange={(event) => {
                                setPassword(event.currentTarget.value);
                            }}
                        />
                        <Button className={classes.submit} type="submit" size="md" loading={isLoggingIn}>
                            Sign in
                        </Button>
                    </div>
                </form>
            </main>
        </div>
    );
}
