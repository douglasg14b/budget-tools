import type {
    CategorizationQueueItemDto,
    ReceiptDto,
    ReceiptMatchDto,
    ReceiptSplitDraftDto,
    ReceiptsDto,
    TransactionDetailDto,
} from '@budget-tools/web-sdk';
import { Receipts } from '@budget-tools/web-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { getBackendErrorMessage } from '../../BackendErrorNotice';
import type { ReceiptLlmSkip } from './applyLlmOverlay';
import { buildReceiptLlmSkip, needsReceiptLookup, overlayQueryKey } from './applyLlmOverlay';
import type { PracticeReceipt } from './practiceReceipts';
import { toMatchPreviewReceipt } from './practiceReceipts';
import { liveReceiptImageSrc, practiceReceiptImageSrc } from './receiptCaptureAttach';

type UseReceiptOverlayInput = {
    readonly current: CategorizationQueueItemDto | undefined;
    readonly currentDecided: boolean;
    readonly prefetchPrevious: CategorizationQueueItemDto | undefined;
    readonly prefetchNext: CategorizationQueueItemDto | undefined;
    readonly live: boolean;
    readonly sessionReceipts: readonly PracticeReceipt[];
};

export type ReceiptOverlayModel = {
    readonly id: string;
    readonly vendor: string | null;
    readonly purchaseDate: string | null;
    readonly printedMilliunits: number | null;
    readonly extractStatus: ReceiptDto['extractStatus'] | null;
    readonly totalsDisagree: boolean;
    readonly imageSrc: string | null;
    readonly closeMatchCount: number;
};

type UseReceiptOverlayResult = {
    readonly errorMessage: string | null;
    readonly isPending: boolean;
    readonly llmSkip: ReceiptLlmSkip | null;
    readonly overlay: ReceiptOverlayModel | undefined;
    readonly splitDraft: ReceiptSplitDraftDto | null;
};

/**
 * Cheap receipt overlay for a Classify card. Live uses lookup (never extract). Practice uses
 * match-preview against session receipts and never GET Live lookup.
 */
export function useReceiptOverlay({
    current,
    currentDecided,
    prefetchPrevious,
    prefetchNext,
    live,
    sessionReceipts,
}: UseReceiptOverlayInput): UseReceiptOverlayResult {
    const queryClient = useQueryClient();
    const currentEnabled = Boolean(current && needsReceiptLookup(current, currentDecided));
    const transactionId = current?.transaction.id;

    const listQuery = useQuery({
        queryKey: ['receipts', 'list'],
        queryFn: ({ signal }) => fetchReceiptList(signal),
        enabled: live && currentEnabled,
        staleTime: 5_000,
        refetchOnWindowFocus: false,
        retry: retryReceiptQuery,
    });

    const lookupQuery = useQuery({
        queryKey: ['receipts', 'lookup-by-transaction', ...(current ? overlayQueryKey(current) : ['none'])],
        queryFn: ({ signal }) => fetchLookup(transactionId ?? '', signal),
        enabled: live && currentEnabled,
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: Number.POSITIVE_INFINITY,
        refetchOnWindowFocus: false,
        retry: retryReceiptQuery,
    });

    usePrefetchReceiptLookup(prefetchPrevious, live);
    usePrefetchReceiptLookup(prefetchNext, live);

    const sessionKey = sessionReceipts.map((receipt) => receipt.id).join(',');
    const practiceMatchQuery = useQuery({
        queryKey: ['receipts', 'match-preview', transactionId ?? 'none', sessionKey],
        queryFn: ({ signal }) => {
            if (!current) {
                throw new Error('Match preview requires a focused transaction');
            }
            return fetchMatchPreview(current.transaction, sessionReceipts, signal);
        },
        enabled: !live && currentEnabled && sessionReceipts.length > 0,
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: Number.POSITIVE_INFINITY,
        refetchOnWindowFocus: false,
        retry: retryReceiptQuery,
    });

    const match = live ? lookupQuery.data : practiceMatchQuery.data;
    const boundFromList = live
        ? listQuery.data?.receipts.find((row) => row.transactionId === transactionId)
        : undefined;
    const boundFromSession = sessionReceipts.find((row) => row.transactionId === transactionId);
    const receiptId = boundFromList?.id ?? boundFromSession?.id ?? match?.exactReceiptId ?? null;

    const receiptQuery = useQuery({
        queryKey: ['receipts', 'get', receiptId ?? 'none'],
        queryFn: ({ signal }) => fetchReceipt(receiptId ?? '', signal),
        enabled: live && Boolean(receiptId),
        refetchInterval: (query) => (query.state.data?.extractStatus === 'pending' ? 2_000 : false),
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: Number.POSITIVE_INFINITY,
        refetchOnWindowFocus: false,
        retry: retryReceiptQuery,
    });

    const liveReceipt = receiptQuery.data ?? boundFromList;
    const practiceReceipt = boundFromSession ?? sessionReceipts.find((row) => row.id === match?.exactReceiptId);
    const receipt = live ? liveReceipt : practiceReceipt;
    const boundToCurrent = Boolean(receipt && 'transactionId' in receipt && receipt.transactionId === transactionId);
    const extractStatus = receipt?.extractStatus ?? null;
    const totalsDisagree = receipt?.totalsDisagree ?? false;
    const llmSkip = buildReceiptLlmSkip({
        autoBind: Boolean(match?.autoBind),
        boundToCurrent,
        extractStatus,
        totalsDisagree,
    });

    const bindAttempted = useRef<string | null>(null);
    const extractStatusSeen = useRef<ReceiptDto['extractStatus'] | null>(null);
    const bindMutation = useMutation({
        mutationFn: async () => {
            const id = match?.exactReceiptId;
            if (!transactionId || !id) {
                throw new Error('No receipt to bind');
            }
            const result = await Receipts.request13({
                path: { id },
                body: { transactionId },
                throwOnError: true,
            });
            if (!result.data) {
                throw new Error('Bind receipt returned no data');
            }
            return result.data;
        },
        onSuccess: async (row) => {
            queryClient.setQueryData(['receipts', 'get', row.id], row);
            await queryClient.invalidateQueries({ queryKey: ['receipts', 'list'] });
            await queryClient.invalidateQueries({ queryKey: ['receipts', 'lookup-by-transaction'] });
        },
        onError: () => {
            bindAttempted.current = null;
        },
    });

    useEffect(() => {
        bindAttempted.current = null;
    }, [transactionId]);

    useEffect(() => {
        const status = liveReceipt?.extractStatus ?? null;
        if (extractStatusSeen.current === 'pending' && status && status !== 'pending') {
            void queryClient.invalidateQueries({ queryKey: ['receipts', 'lookup-by-transaction'] });
        }
        extractStatusSeen.current = status;
    }, [liveReceipt?.extractStatus, queryClient]);

    useEffect(() => {
        if (!live || !currentEnabled || !match?.autoBind || !match.exactReceiptId || !transactionId) {
            return;
        }
        if (liveReceipt?.transactionId === transactionId) {
            return;
        }
        const attemptKey = `${match.exactReceiptId}:${transactionId}`;
        if (bindAttempted.current === attemptKey) {
            return;
        }
        bindAttempted.current = attemptKey;
        bindMutation.mutate();
    }, [
        currentEnabled,
        live,
        liveReceipt?.transactionId,
        match?.autoBind,
        match?.exactReceiptId,
        transactionId,
        bindMutation.mutate,
    ]);

    const overlay = receipt
        ? {
              id: receipt.id,
              vendor: receipt.vendor,
              purchaseDate: receipt.purchaseDate,
              printedMilliunits: receipt.printedMilliunits,
              extractStatus: receipt.extractStatus,
              totalsDisagree: receipt.totalsDisagree,
              imageSrc: live
                  ? liveReceiptImageSrc({
                        id: receipt.id,
                        hasProcessed: 'hasProcessed' in receipt ? receipt.hasProcessed : false,
                    })
                  : 'frames' in receipt
                    ? practiceReceiptImageSrc(receipt)
                    : null,
              closeMatchCount: match?.closeMatches.length ?? 0,
          }
        : undefined;

    const lookupPending = live
        ? currentEnabled && lookupQuery.data === undefined && lookupQuery.isFetching
        : currentEnabled &&
          sessionReceipts.length > 0 &&
          practiceMatchQuery.data === undefined &&
          practiceMatchQuery.isFetching;
    const extractPending =
        live && currentEnabled && Boolean(receiptId) && receiptQuery.data === undefined && receiptQuery.isFetching;

    return {
        errorMessage: formatReceiptError(
            lookupQuery.error ?? practiceMatchQuery.error ?? receiptQuery.error ?? bindMutation.error,
        ),
        isPending: lookupPending || extractPending,
        llmSkip,
        overlay,
        splitDraft: match?.splitDraft ?? null,
    };
}

function usePrefetchReceiptLookup(item: CategorizationQueueItemDto | undefined, live: boolean): void {
    useQuery({
        queryKey: ['receipts', 'lookup-by-transaction', ...(item ? overlayQueryKey(item) : ['none'])],
        queryFn: ({ signal }) => fetchLookup(item?.transaction.id ?? '', signal),
        enabled: live && Boolean(item && needsReceiptLookup(item)),
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: Number.POSITIVE_INFINITY,
        refetchOnWindowFocus: false,
        retry: retryReceiptQuery,
    });
}

async function fetchLookup(transactionId: string, signal?: AbortSignal): Promise<ReceiptMatchDto> {
    const result = await Receipts.request3({
        query: { transactionId },
        signal,
        throwOnError: true,
    });
    if (!result.data) {
        throw new Error('Receipt lookup returned no data');
    }
    return result.data;
}

async function fetchReceiptList(signal?: AbortSignal): Promise<ReceiptsDto> {
    const result = await Receipts.request({ signal, throwOnError: true });
    if (!result.data) {
        throw new Error('Receipt list returned no data');
    }
    return result.data;
}

async function fetchReceipt(id: string, signal?: AbortSignal): Promise<ReceiptDto> {
    const result = await Receipts.request9({ path: { id }, signal, throwOnError: true });
    if (!result.data) {
        throw new Error('Receipt returned no data');
    }
    return result.data;
}

async function fetchMatchPreview(
    transaction: TransactionDetailDto,
    receipts: readonly PracticeReceipt[],
    signal?: AbortSignal,
): Promise<ReceiptMatchDto> {
    const result = await Receipts.request5({
        body: {
            receipts: receipts.map(toMatchPreviewReceipt),
            transaction: {
                id: transaction.id,
                date: transaction.date,
                amount: transaction.amount,
                payeeName: transaction.payeeName,
                importPayeeName: transaction.importPayeeName,
                importPayeeNameOriginal: transaction.importPayeeNameOriginal,
            },
        },
        signal,
        throwOnError: true,
    });
    if (!result.data) {
        throw new Error('Match preview returned no data');
    }
    return result.data;
}

function retryReceiptQuery(failureCount: number, error: unknown): boolean {
    return isAbortError(error) && failureCount < 1;
}

function formatReceiptError(error: unknown): string | null {
    if (!error) {
        return null;
    }
    const message = getBackendErrorMessage(error);
    if (isAbortError(error) && /aborted|cancelled/i.test(message) && !/timed out/i.test(message)) {
        return null;
    }
    return message === 'Request failed.' ? 'Receipt lookup unavailable' : message;
}

function isAbortError(error: unknown): boolean {
    return Boolean(
        error && typeof error === 'object' && 'name' in error && (error as { name?: string }).name === 'AbortError',
    );
}
