import type { ReceiptDto, ReceiptMatchDto } from '@budget-tools/web-sdk';
import {
    bindReceiptMutation,
    detachReceiptMutation,
    listReceiptsOptions,
    listReceiptsQueryKey,
    lookupByReceiptOptions,
    Receipts,
} from '@budget-tools/web-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import { BackendErrorNotice, getBackendErrorMessage } from '../../BackendErrorNotice';
import { ClassifyReceiptCapture } from '../classify/ClassifyReceiptCapture';
import { usePracticeReceipts } from '../classify/PracticeReceiptsContext';
import type { PracticeReceipt } from '../classify/practiceReceipts';
import { bindPracticeReceipt, toMatchPreviewReceipt } from '../classify/practiceReceipts';
import { useReceiptCapture } from '../classify/useReceiptCapture';
import { ReceiptBindPanel } from './ReceiptBindPanel';
import type { InboxSlipModel } from './ReceiptSlip';
import { ReceiptSlip } from './ReceiptSlip';
import classes from './ReceiptsInbox.module.css';

type ReceiptsInboxProps = {
    readonly live: boolean;
};

/**
 * Burst capture without a focused transaction. Live lists SQLite receipts; Practice is session-only.
 */
export function ReceiptsInbox({ live }: ReceiptsInboxProps) {
    const queryClient = useQueryClient();
    const { receipts: sessionReceipts, setReceipts: setSessionReceipts } = usePracticeReceipts();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const bindAttempted = useRef<string | null>(null);

    const listQuery = useQuery({
        ...listReceiptsOptions(),
        enabled: live,
        refetchInterval: (query) =>
            query.state.data?.receipts.some((row) => row.extractStatus === 'pending') ? 2_000 : false,
        refetchOnWindowFocus: false,
    });

    const slips = useMemo(
        () => (live ? (listQuery.data?.receipts ?? []).map(slipFromDto) : sessionReceipts.map(slipFromPractice)),
        [live, listQuery.data?.receipts, sessionReceipts],
    );
    const selected = slips.find((slip) => slip.id === selectedId) ?? slips[0];
    const selectedSession = sessionReceipts.find((row) => row.id === selected?.id);

    useEffect(() => {
        if (!selectedId && slips[0]) {
            setSelectedId(slips[0].id);
        }
    }, [selectedId, slips]);

    const lookupQuery = useQuery({
        ...lookupByReceiptOptions({ query: { receiptId: selected?.id ?? '' } }),
        enabled: live && Boolean(selected?.id),
        staleTime: 5_000,
        refetchOnWindowFocus: false,
    });

    const practiceMatchQuery = useQuery({
        queryKey: ['receipts', 'match-preview-by-receipt', selected?.id ?? 'none'],
        queryFn: ({ signal }) => {
            if (!selectedSession) {
                throw new Error('Match preview requires a session receipt');
            }
            return fetchReceiptTowardBank(selectedSession, signal);
        },
        enabled: !live && Boolean(selectedSession),
        staleTime: 5_000,
        refetchOnWindowFocus: false,
    });

    const match = live ? lookupQuery.data : practiceMatchQuery.data;

    const capture = useReceiptCapture({
        live,
        transactionId: null,
        keepCameraOnAttach: true,
        onLiveCreated: (row) => {
            setSelectedId(row.id);
        },
        onPracticeReceipt: (row) => {
            setSessionReceipts((previous) => [...previous, row]);
            setSelectedId(row.id);
        },
    });

    const bindMutation = useMutation({
        ...bindReceiptMutation(),
        onSuccess: async (row) => {
            if (row) {
                queryClient.setQueryData(['receipts', 'get', row.id], row);
            }
            await queryClient.invalidateQueries({ queryKey: listReceiptsQueryKey() });
            await queryClient.invalidateQueries({ queryKey: ['receipts', 'list'] });
            await queryClient.invalidateQueries({ queryKey: ['receipts', 'lookup-by-transaction'] });
            await queryClient.invalidateQueries({ queryKey: ['receipts', 'lookup-by-receipt'] });
        },
        onError: () => {
            bindAttempted.current = null;
        },
    });

    const detachMutation = useMutation({
        ...detachReceiptMutation(),
        onSuccess: async (row) => {
            if (row) {
                queryClient.setQueryData(['receipts', 'get', row.id], row);
            }
            await queryClient.invalidateQueries({ queryKey: listReceiptsQueryKey() });
            await queryClient.invalidateQueries({ queryKey: ['receipts', 'list'] });
            await queryClient.invalidateQueries({ queryKey: ['receipts', 'lookup-by-transaction'] });
            await queryClient.invalidateQueries({ queryKey: ['receipts', 'lookup-by-receipt'] });
        },
    });

    useEffect(() => {
        bindAttempted.current = null;
    }, [selected?.id]);

    useEffect(() => {
        if (!selected || !match?.autoBind || !match.exactTransactionId) {
            return;
        }
        if (selected.transactionId === match.exactTransactionId) {
            return;
        }
        const attemptKey = `${selected.id}:${match.exactTransactionId}`;
        if (bindAttempted.current === attemptKey) {
            return;
        }
        bindAttempted.current = attemptKey;
        if (live) {
            bindMutation.mutate({ path: { id: selected.id }, body: { transactionId: match.exactTransactionId } });
            return;
        }
        setSessionReceipts((previous) => bindPracticeReceipt(previous, selected.id, match.exactTransactionId));
    }, [live, match?.autoBind, match?.exactTransactionId, selected, setSessionReceipts, bindMutation.mutate]);

    function bindTo(transactionId: string): void {
        if (!selected) {
            return;
        }
        if (live) {
            bindMutation.mutate({ path: { id: selected.id }, body: { transactionId } });
            return;
        }
        setSessionReceipts((previous) => bindPracticeReceipt(previous, selected.id, transactionId));
    }

    function detach(): void {
        if (!selected) {
            return;
        }
        if (live) {
            detachMutation.mutate({ path: { id: selected.id } });
            return;
        }
        setSessionReceipts((previous) => bindPracticeReceipt(previous, selected.id, null));
    }

    const matchError = live ? lookupQuery.error : practiceMatchQuery.error;
    const writeError = bindMutation.error ?? detachMutation.error;

    return (
        <div className={classes.inbox}>
            <section className={classes.capture} aria-labelledby="inbox-capture-title">
                <h2 id="inbox-capture-title" className={classes.captureTitle}>
                    Capture
                </h2>
                <p className={classes.captureLede}>
                    Snap or upload a tape. It starts unbound. Extract runs in the background.
                </p>
                <ClassifyReceiptCapture capture={capture} submitLabel="Add to inbox" />
            </section>

            {listQuery.error ? <BackendErrorNotice error={listQuery.error} /> : null}

            <div className={classes.board}>
                <ol className={classes.stack}>
                    {live && listQuery.isPending ? <li className={classes.empty}>Loading receipts…</li> : null}
                    {!listQuery.isPending && slips.length === 0 ? (
                        <li className={classes.empty}>No receipts yet. Add a photo to start matching.</li>
                    ) : null}
                    {slips.map((slip) => (
                        <li key={slip.id}>
                            <ReceiptSlip
                                selected={slip.id === selected?.id}
                                slip={slip}
                                boundLabel={
                                    slip.transactionId
                                        ? boundPayee(slip.id === selected?.id ? match : undefined, slip.transactionId)
                                        : null
                                }
                                onSelect={setSelectedId}
                            />
                        </li>
                    ))}
                </ol>
                {selected ? (
                    <ReceiptBindPanel
                        asking={
                            live
                                ? lookupQuery.isFetching && lookupQuery.data === undefined
                                : practiceMatchQuery.isFetching && practiceMatchQuery.data === undefined
                        }
                        binding={bindMutation.isPending || detachMutation.isPending}
                        boundTransactionId={selected.transactionId}
                        error={formatInboxError(matchError ?? writeError)}
                        live={live}
                        match={match}
                        onBind={bindTo}
                        onDetach={detach}
                    />
                ) : null}
            </div>
        </div>
    );
}

function slipFromDto(row: ReceiptDto): InboxSlipModel {
    return {
        id: row.id,
        vendor: row.vendor,
        purchaseDate: row.purchaseDate,
        printedMilliunits: row.printedMilliunits,
        extractStatus: row.extractStatus,
        totalsDisagree: row.totalsDisagree,
        transactionId: row.transactionId,
        imageSrc: `/api/receipts/${row.id}/image`,
    };
}

function slipFromPractice(row: PracticeReceipt): InboxSlipModel {
    return {
        id: row.id,
        vendor: row.vendor,
        purchaseDate: row.purchaseDate,
        printedMilliunits: row.printedMilliunits,
        extractStatus: row.extractStatus,
        totalsDisagree: row.totalsDisagree,
        transactionId: row.transactionId,
        imageSrc: row.frames[0] ?? null,
    };
}

function boundPayee(match: ReceiptMatchDto | undefined, transactionId: string | null): string | null {
    if (!transactionId) {
        return null;
    }
    const candidate = match?.bindCandidates.find((row) => row.id === transactionId);
    return candidate?.payeeName ?? candidate?.importPayeeName ?? 'Bank charge';
}

async function fetchReceiptTowardBank(receipt: PracticeReceipt, signal?: AbortSignal): Promise<ReceiptMatchDto> {
    const result = await Receipts.request5({
        body: { receipts: [toMatchPreviewReceipt(receipt)] },
        signal,
        throwOnError: true,
    });
    if (!result.data) {
        throw new Error('Match preview returned no data');
    }
    return result.data;
}

function formatInboxError(error: unknown): string | null {
    if (!error) {
        return null;
    }
    return getBackendErrorMessage(error, 'Could not match that receipt.');
}
