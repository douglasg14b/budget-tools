import { CloseButton, TextInput } from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import { useRef } from 'react';

import classes from './QueueSearchInput.module.css';

type QueueSearchInputProps = {
    /** Accessible name when `compact` hides the visible label. */
    ariaLabel?: string;
    compact?: boolean;
    onChange: (q: string | undefined) => void;
    placeholder?: string;
    value: string | undefined;
};

export function QueueSearchInput({
    ariaLabel = 'Search transactions',
    compact = false,
    onChange,
    placeholder = 'Payee, memo, amount…',
    value,
}: QueueSearchInputProps) {
    const inputRef = useRef<HTMLInputElement>(null);

    useHotkeys(
        [
            [
                '/',
                (event) => {
                    event.preventDefault();
                    inputRef.current?.focus();
                },
            ],
        ],
        ['INPUT', 'TEXTAREA', 'SELECT'],
    );

    return (
        <TextInput
            ref={inputRef}
            className={classes.input}
            aria-label={compact ? ariaLabel : undefined}
            label={compact ? undefined : 'Search'}
            placeholder={placeholder}
            value={value ?? ''}
            rightSection={
                value ? (
                    <CloseButton
                        aria-label="Clear search"
                        onClick={() => {
                            onChange(undefined);
                            inputRef.current?.focus();
                        }}
                    />
                ) : null
            }
            onChange={(event) => {
                const next = event.currentTarget.value;
                onChange(next.trim() ? next : undefined);
            }}
            onKeyDown={(event) => {
                if (event.key === 'Escape' && value) {
                    event.preventDefault();
                    onChange(undefined);
                }
            }}
        />
    );
}
