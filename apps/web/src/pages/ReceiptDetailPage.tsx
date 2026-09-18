import type { ReceiptDto, ReceiptMatchDto } from '@budget-tools/web-sdk';
import {
    bindReceiptMutation,
    deleteReceiptMutation,
    detachReceiptMutation,
    getOperatingModeOptions,
    getReceiptOptions,
    getReceiptQueryKey,
    listReceiptsQueryKey,
    lookupByReceiptOptions,
    lookupByReceiptQueryKey,
    patchReceiptMutation,
    Receipts,
} from '@budget-tools/web-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { getBackendErrorMessage } from '../components/BackendErrorNotice';
import { usePracticeReceipts } from '../components/review/classify/PracticeReceiptsContext';
import type { PracticeReceipt } from '../components/review/classify/practiceReceipts';
import { bindPracticeReceipt, toMatchPreviewReceipt } from '../components/review/classify/practiceReceipts';
import { liveReceiptImageSrc, practiceReceiptImageSrc } from '../components/review/classify/receiptCaptureAttach';
import type { ReceiptExtractEdit } from '../components/review/receipts/applyReceiptExtractEdit';
import { applyPracticeReceiptExtractEdit } from '../components/review/receipts/applyReceiptExtractEdit';
import type { ReceiptDetailModel } from '../components/review/receipts/ReceiptDetail';
import { ReceiptDetail } from '../components/review/receipts/ReceiptDetail';
import { isFromReceiptsInbox, receiptsInboxBackTarget } from '../components/review/receipts/receiptsInboxBack';
import type { OperatingMode } from '../operatingMode/operatingModeCopy';
import classes from './ReceiptsPage.module.css';

export function ReceiptDetailPage() {
    const { receiptId = '' } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const modeQuery = useQuery(getOperatingModeOptions());
    const mode: OperatingMode = modeQuery.data?.mode ?? 'practice';
    const live = mode === 'live';
    const { receipts: sessionReceipts, setReceipts: setSessionReceipts } = usePracticeReceipts();
    const bindAttempted = useRef<string | null>(null);
    const [practiceSaveError, setPracticeSaveError] = useState<string | null>(null);
    const [saveEpoch, setSaveEpoch] = useState(0);

    const receiptQuery = useQuery({
        ...getReceiptOptions({ path: { id: receiptId } }),
        enabled: live && Boolean(receiptId),
        refetchInterval: (query) => (query.state.data?.extractStatus === 'pending' ? 2_000 : false),
        refetchOnWindowFocus: false,
    });

    const sessionReceipt = sessionReceipts.find((row) => row.id === receiptId);
    const receipt = live
        ? receiptQuery.data
            ? modelFromDto(receiptQuery.data)
            : null
        : sessionReceipt
          ? modelFromPractice(sessionReceipt)
          : null;
    const missing = live ? receiptQuery.isError : Boolean(receiptId) && !sessionReceipt;

    const lookupQuery = useQuery({
        ...lookupByReceiptOptions({ query: { receiptId } }),
        enabled: live && Boolean(receipt?.id),
        staleTime: 5_000,
        refetchOnWindowFocus: false,
    });

    const practiceMatchQuery = useQuery({
        queryKey: ['receipts', 'match-preview-by-receipt', receiptId || 'none'],
        queryFn: ({ signal }) => {
            if (!sessionReceipt) {
                throw new Error('Match preview requires a session receipt');
            }
            return fetchReceiptTowardBank(sessionReceipt, signal);
        },
        enabled: !live && Boolean(sessionReceipt),
        staleTime: 5_000,
        refetchOnWindowFocus: false,
    });

    const match = live ? lookupQuery.data : practiceMatchQuery.data;

    const bindMutation = useMutation({
        ...bindReceiptMutation(),
        onSuccess: async (row) => {
            await cacheReceiptRow(queryClient, row);
            await invalidateReceiptQueries(queryClient, receiptId);
        },
        onError: () => {
            bindAttempted.current = null;
        },
    });

    const detachMutation = useMutation({
        ...detachReceiptMutation(),
        onSuccess: async (row) => {
            await cacheReceiptRow(queryClient, row);
            await invalidateReceiptQueries(queryClient, receiptId);
        },
    });

    const patchMutation = useMutation({
        ...patchReceiptMutation(),
        onSuccess: async (row) => {
            await cacheReceiptRow(queryClient, row);
            await invalidateReceiptQueries(queryClient, receiptId);
            setSaveEpoch((epoch) => epoch + 1);
        },
    });

    const deleteMutation = useMutation({
        ...deleteReceiptMutation(),
        onSuccess: async () => {
            await invalidateReceiptQueries(queryClient, receiptId);
            goToInbox();
        },
    });

    useEffect(() => {
        bindAttempted.current = null;
        setPracticeSaveError(null);
    }, [receiptId]);

    useEffect(() => {
        if (!receipt || !match?.autoBind || !match.exactTransactionId) {
            return;
        }
        if (receipt.transactionId === match.exactTransactionId) {
            return;
        }
        const attemptKey = `${receipt.id}:${match.exactTransactionId}`;
        if (bindAttempted.current === attemptKey) {
            return;
        }
        bindAttempted.current = attemptKey;
        if (live) {
            bindMutation.mutate({ path: { id: receipt.id }, body: { transactionId: match.exactTransactionId } });
            return;
        }
        setSessionReceipts((previous) => bindPracticeReceipt(previous, receipt.id, match.exactTransactionId));
    }, [live, match?.autoBind, match?.exactTransactionId, receipt, setSessionReceipts, bindMutation.mutate]);

    function goToInbox(): void {
        const target = receiptsInboxBackTarget({
            search: location.search,
            fromInbox: isFromReceiptsInbox(location.state),
        });
        if (target.kind === 'history') {
            void navigate(-1);
            return;
        }
        void navigate({ pathname: target.pathname, search: target.search });
    }

    function bindTo(transactionId: string): void {
        if (!receipt) {
            return;
        }
        if (live) {
            bindMutation.mutate({ path: { id: receipt.id }, body: { transactionId } });
            return;
        }
        setSessionReceipts((previous) => bindPracticeReceipt(previous, receipt.id, transactionId));
    }

    function detach(): void {
        if (!receipt) {
            return;
        }
        if (live) {
            detachMutation.mutate({ path: { id: receipt.id } });
            return;
        }
        setSessionReceipts((previous) => bindPracticeReceipt(previous, receipt.id, null));
    }

    function remove(): void {
        if (!receipt) {
            return;
        }
        if (live) {
            deleteMutation.mutate({ path: { id: receipt.id } });
            return;
        }
        setSessionReceipts((previous) => previous.filter((row) => row.id !== receipt.id));
        goToInbox();
    }

    function saveExtract(edit: ReceiptExtractEdit): void {
        if (!receipt) {
            return;
        }
        if (live) {
            patchMutation.mutate({
                path: { id: receipt.id },
                body: {
                    vendor: edit.vendor,
                    purchaseDate: edit.purchaseDate,
                    printedMilliunits: edit.printedMilliunits,
                    taxMilliunits: edit.taxMilliunits,
                    discountMilliunits: edit.discountMilliunits,
                    lines: edit.lines.map((line) => ({
                        name: line.name,
                        amountMilliunits: line.amountMilliunits,
                        quantity: line.quantity,
                    })),
                },
            });
            return;
        }
        try {
            setPracticeSaveError(null);
            const next = applyPracticeReceiptExtractEdit(sessionReceipts, receipt.id, edit);
            setSessionReceipts(next);
            setSaveEpoch((epoch) => epoch + 1);
        } catch (caught) {
            setPracticeSaveError(getBackendErrorMessage(caught, 'Could not save that receipt.'));
        }
    }

    const matchError = live ? lookupQuery.error : practiceMatchQuery.error;
    const writeError = bindMutation.error ?? detachMutation.error ?? deleteMutation.error;

    return (
        <div className={classes.page}>
            <ReceiptDetail
                askingMatch={
                    live
                        ? lookupQuery.isFetching && lookupQuery.data === undefined
                        : practiceMatchQuery.isFetching && practiceMatchQuery.data === undefined
                }
                binding={bindMutation.isPending || detachMutation.isPending}
                deleting={deleteMutation.isPending}
                error={formatDetailError(matchError ?? writeError ?? (live ? receiptQuery.error : null))}
                live={live}
                loading={live && receiptQuery.isPending}
                match={match}
                missing={missing}
                receipt={receipt}
                saveError={practiceSaveError ?? formatDetailError(patchMutation.error)}
                saveEpoch={saveEpoch}
                saving={patchMutation.isPending}
                onBack={goToInbox}
                onBind={bindTo}
                onDelete={remove}
                onDetach={detach}
                onSave={saveExtract}
            />
        </div>
    );
}

function modelFromDto(row: ReceiptDto): ReceiptDetailModel {
    return {
        id: row.id,
        vendor: row.vendor,
        purchaseDate: row.purchaseDate,
        printedMilliunits: row.printedMilliunits,
        extractStatus: row.extractStatus,
        totalsDisagree: row.totalsDisagree,
        extractJson: row.extractJson,
        rawText: row.rawText,
        extractCostUsd: row.extractCostUsd,
        transactionId: row.transactionId,
        createdAt: row.createdAt,
        frameCount: row.frameCount,
        imageSrc: liveReceiptImageSrc(row),
    };
}

function modelFromPractice(row: PracticeReceipt): ReceiptDetailModel {
    return {
        id: row.id,
        vendor: row.vendor,
        purchaseDate: row.purchaseDate,
        printedMilliunits: row.printedMilliunits,
        extractStatus: row.extractStatus,
        totalsDisagree: row.totalsDisagree,
        extractJson: row.extractJson,
        rawText: row.rawText,
        extractCostUsd: null,
        transactionId: row.transactionId,
        createdAt: null,
        frameCount: row.frames.length,
        imageSrc: practiceReceiptImageSrc(row),
    };
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

async function cacheReceiptRow(
    queryClient: ReturnType<typeof useQueryClient>,
    row: ReceiptDto | undefined,
): Promise<void> {
    if (!row) {
        return;
    }
    queryClient.setQueryData(getReceiptQueryKey({ path: { id: row.id } }), row);
    queryClient.setQueryData(['receipts', 'get', row.id], row);
}

async function invalidateReceiptQueries(
    queryClient: ReturnType<typeof useQueryClient>,
    receiptId: string,
): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: listReceiptsQueryKey() });
    await queryClient.invalidateQueries({ queryKey: ['receipts', 'list'] });
    await queryClient.invalidateQueries({ queryKey: ['receipts', 'lookup-by-transaction'] });
    await queryClient.invalidateQueries({ queryKey: lookupByReceiptQueryKey({ query: { receiptId } }) });
    await queryClient.invalidateQueries({ queryKey: getReceiptQueryKey({ path: { id: receiptId } }) });
}

function formatDetailError(error: unknown): string | null {
    if (!error) {
        return null;
    }
    return getBackendErrorMessage(error, 'Could not load that receipt.');
}
