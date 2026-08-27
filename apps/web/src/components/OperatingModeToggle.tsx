import type { OperatingModeDto } from '@budget-tools/web-sdk';
import { getOperatingModeOptions, getOperatingModeQueryKey, patchOperatingModeMutation } from '@budget-tools/web-sdk';
import { Modal } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { OperatingMode } from '../operatingMode/operatingModeCopy';
import { getBackendErrorMessage } from './BackendErrorNotice';
import classes from './OperatingModeToggle.module.css';

export function OperatingModeToggle() {
    const queryClient = useQueryClient();
    const modeQuery = useQuery(getOperatingModeOptions());
    const mode: OperatingMode = modeQuery.data?.mode ?? 'practice';
    const [confirmLive, setConfirmLive] = useState(false);

    const mutation = useMutation({
        ...patchOperatingModeMutation(),
        onSuccess: (data: OperatingModeDto) => {
            queryClient.setQueryData(getOperatingModeQueryKey(), data);
            setConfirmLive(false);
        },
    });

    const disabled = modeQuery.isPending || mutation.isPending;

    function requestMode(next: OperatingMode): void {
        if (next === mode || disabled) {
            return;
        }
        if (next === 'live') {
            setConfirmLive(true);
            return;
        }
        mutation.mutate({ body: { mode: next } });
    }

    return (
        <>
            <fieldset className={classes.toggle}>
                <legend className={classes.legend}>Operating mode</legend>
                <button
                    className={classes.option}
                    type="button"
                    aria-pressed={mode === 'practice'}
                    data-active={mode === 'practice' || undefined}
                    disabled={disabled}
                    onClick={() => {
                        requestMode('practice');
                    }}
                >
                    Practice
                </button>
                <button
                    className={classes.option}
                    type="button"
                    aria-pressed={mode === 'live'}
                    data-active={mode === 'live' || undefined}
                    data-live
                    disabled={disabled}
                    onClick={() => {
                        requestMode('live');
                    }}
                >
                    Live
                </button>
            </fieldset>
            <Modal
                centered
                opened={confirmLive}
                padding={0}
                radius="md"
                size="28rem"
                title="Switch to Live?"
                classNames={{
                    overlay: classes.overlay,
                    content: classes.content,
                    header: classes.header,
                    title: classes.title,
                    body: classes.body,
                    close: classes.close,
                }}
                onClose={() => {
                    setConfirmLive(false);
                }}
            >
                <p className={classes.lede}>
                    Accepted classifications will be written to YNAB. Stay in Practice if you are still reviewing.
                </p>
                {mutation.isError ? <p className={classes.error}>{getBackendErrorMessage(mutation.error)}</p> : null}
                <div className={classes.actions}>
                    <button
                        className={classes.stay}
                        type="button"
                        onClick={() => {
                            setConfirmLive(false);
                        }}
                    >
                        Stay in Practice
                    </button>
                    <button
                        className={classes.goLive}
                        type="button"
                        disabled={mutation.isPending}
                        onClick={() => {
                            mutation.mutate({ body: { mode: 'live' } });
                        }}
                    >
                        {mutation.isPending ? 'Switching…' : 'Go Live'}
                    </button>
                </div>
            </Modal>
        </>
    );
}
