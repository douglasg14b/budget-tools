import type { PayeeSuggestionDto } from '@budget-tools/web-sdk';
import { TextInput, Tooltip, UnstyledButton } from '@mantine/core';
import { useEffect, useState } from 'react';

import { formatConfidence } from '../formatConfidence';
import classes from './ClassifyPayee.module.css';
import { PAYEE_RENAME_EXPLANATIONS } from './payeeRenameCopy';

type ClassifyPayeeProps = {
    onCommit: (name: string) => void;
    onDismissRename: () => void;
    payee: string;
    rename: PayeeSuggestionDto | null;
    variant?: 'hero' | 'compact';
};

export function ClassifyPayee({ onCommit, onDismissRename, payee, rename, variant = 'hero' }: ClassifyPayeeProps) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(payee);

    useEffect(() => {
        setEditing(false);
        setDraft(payee);
    }, [payee]);

    function commitDraft(): void {
        const next = draft.trim();
        setEditing(false);
        if (next && next !== payee) {
            onCommit(next);
            return;
        }
        setDraft(payee);
    }

    const renameExplanation = rename ? PAYEE_RENAME_EXPLANATIONS[rename.method] : undefined;

    return (
        <div className={classes.root} data-variant={variant}>
            {editing ? (
                <TextInput
                    autoFocus
                    aria-label="Payee name"
                    classNames={{ input: classes.input }}
                    size={variant === 'compact' ? 'xs' : 'md'}
                    value={draft}
                    onBlur={commitDraft}
                    onChange={(event) => {
                        setDraft(event.currentTarget.value);
                    }}
                    onClick={(event) => {
                        event.stopPropagation();
                    }}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            commitDraft();
                        }
                        if (event.key === 'Escape') {
                            event.preventDefault();
                            setDraft(payee);
                            setEditing(false);
                        }
                    }}
                />
            ) : (
                <UnstyledButton
                    aria-label="Edit payee"
                    className={classes.payee}
                    onClick={(event) => {
                        event.stopPropagation();
                        setDraft(payee);
                        setEditing(true);
                    }}
                >
                    {payee || 'Set payee'}
                </UnstyledButton>
            )}
            {rename ? (
                <p className={classes.rename}>
                    <span className={classes.useGroup}>
                        <span className={classes.useLabel}>Use</span>
                        <Tooltip label={renameExplanation}>
                            <UnstyledButton
                                aria-label={`Use ${rename.name}. ${renameExplanation}`}
                                className={classes.use}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onCommit(rename.name);
                                }}
                            >
                                {rename.name}
                            </UnstyledButton>
                        </Tooltip>
                    </span>
                    {variant === 'hero' ? (
                        <span className={classes.confidence}>{formatConfidence(rename.confidence)}</span>
                    ) : null}
                    <UnstyledButton
                        className={classes.keep}
                        onClick={(event) => {
                            event.stopPropagation();
                            onDismissRename();
                        }}
                    >
                        Keep current
                    </UnstyledButton>
                </p>
            ) : null}
        </div>
    );
}
