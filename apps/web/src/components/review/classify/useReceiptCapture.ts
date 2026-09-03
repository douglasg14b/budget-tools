import type { ReceiptDto } from '@budget-tools/web-sdk';
import { listReceiptsQueryKey, Receipts } from '@budget-tools/web-sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';

import { getBackendErrorMessage } from '../../BackendErrorNotice';
import type { PracticeReceipt } from './practiceReceipts';
import { practiceReceiptFromExtract } from './practiceReceipts';
import {
    assertReceiptJsonBodyWithinLimit,
    buildCreateReceiptBody,
    buildExtractPreviewBody,
    RECEIPT_BODY_TOO_LARGE_MESSAGE,
} from './receiptCaptureAttach';
import type { ReceiptCaptureDraft } from './receiptCaptureDraft';
import {
    canAttachReceiptDraft,
    EMPTY_RECEIPT_CAPTURE_DRAFT,
    receiptDraftOriginal,
    receiptDraftProcessed,
    reduceReceiptCaptureDraft,
} from './receiptCaptureDraft';
import type { ReceiptScanCorners, ReceiptScanImage } from './scanicReceiptPrep';
import {
    extractReceiptImage,
    loadReceiptImageFromDataUrl,
    mountScanicCornerEditor,
    RECEIPT_CAPTURE_JPEG_QUALITY,
    scanReceiptImage,
} from './scanicReceiptPrep';

type UseReceiptCaptureInput = {
    readonly live: boolean;
    readonly transactionId: string | null;
    readonly keepCameraOnAttach?: boolean;
    readonly onLiveCreated?: (row: ReceiptDto) => void;
    readonly onPracticeReceipt: (receipt: PracticeReceipt) => void;
};

export type ReceiptCaptureState = {
    readonly canAttach: boolean;
    readonly cameraOpen: boolean;
    readonly cameraSupported: boolean;
    readonly cornerEditorOpen: boolean;
    readonly draftStatus: ReceiptCaptureDraft['status'];
    readonly editingCorners: boolean;
    readonly error: string | null;
    readonly originalPreview: string | null;
    readonly processedPreview: string | null;
    readonly submitting: boolean;
    readonly cornerHostRef: RefObject<HTMLDivElement | null>;
    readonly videoRef: RefObject<HTMLVideoElement | null>;
    readonly adjustCorners: () => void;
    readonly attach: () => void;
    readonly closeCamera: () => void;
    readonly discardDraft: () => void;
    readonly openCamera: () => void;
    readonly pickFiles: (files: readonly File[]) => void;
    readonly snap: () => void;
};

type AttachImages = {
    readonly original: string;
    readonly processed: string;
    readonly transactionId: string | null;
};

/**
 * Card or inbox capture: one photo through Scanic, then Live create or Practice extract-preview.
 * Inbox passes a null transactionId and keepCameraOnAttach so burst capture can continue.
 */
export function useReceiptCapture({
    live,
    transactionId,
    keepCameraOnAttach = false,
    onLiveCreated,
    onPracticeReceipt,
}: UseReceiptCaptureInput): ReceiptCaptureState {
    const queryClient = useQueryClient();
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const cornerHostRef = useRef<HTMLDivElement | null>(null);
    const sourceRef = useRef<ReceiptScanImage | null>(null);
    const cornersRef = useRef<ReceiptScanCorners | null>(null);
    const originalRef = useRef<string | null>(null);
    const editorRef = useRef<{ destroy: () => void } | null>(null);
    const prepGenerationRef = useRef(0);
    const confirmCornersRef = useRef<((corners: ReceiptScanCorners) => Promise<void>) | null>(null);
    const [draft, setDraft] = useState<ReceiptCaptureDraft>(EMPTY_RECEIPT_CAPTURE_DRAFT);
    const [editingCorners, setEditingCorners] = useState(false);
    const [cameraOpen, setCameraOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const cameraSupported = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

    const liveCreate = useMutation({
        mutationFn: async (input: AttachImages) => {
            const result = await Receipts.request2({
                body: buildCreateReceiptBody({
                    original: input.original,
                    processed: input.processed,
                    transactionId: input.transactionId,
                }),
                throwOnError: true,
            });
            if (!result.data) {
                throw new Error('Create receipt returned no data');
            }
            return result.data;
        },
        onSuccess: async (row: ReceiptDto) => {
            queryClient.setQueryData(['receipts', 'get', row.id], row);
            await queryClient.invalidateQueries({ queryKey: listReceiptsQueryKey() });
            await queryClient.invalidateQueries({ queryKey: ['receipts', 'list'] });
            await queryClient.invalidateQueries({ queryKey: ['receipts', 'lookup-by-transaction'] });
            onLiveCreated?.(row);
        },
    });

    const practiceExtract = useMutation({
        mutationFn: async (input: AttachImages) => {
            const result = await Receipts.request6({
                body: buildExtractPreviewBody({
                    original: input.original,
                    processed: input.processed,
                }),
                throwOnError: true,
            });
            if (!result.data) {
                throw new Error('Extract preview returned no data');
            }
            return result.data;
        },
        onSuccess: (extract, input) => {
            const receipt = practiceReceiptFromExtract({
                id: crypto.randomUUID(),
                transactionId: input.transactionId,
                frames: [input.original],
                processedPreview: input.processed,
                extract,
            });
            if (!receipt) {
                setError('Amazon receipts are not captured here.');
                return;
            }
            onPracticeReceipt(receipt);
        },
    });

    useEffect(() => {
        return () => {
            stopStream(streamRef.current);
            streamRef.current = null;
            destroyCornerEditor(editorRef);
        };
    }, []);

    useEffect(() => {
        prepGenerationRef.current += 1;
        setDraft(EMPTY_RECEIPT_CAPTURE_DRAFT);
        setEditingCorners(false);
        setError(null);
        sourceRef.current = null;
        originalRef.current = null;
        cornersRef.current = null;
        destroyCornerEditor(editorRef);
        stopStream(streamRef.current);
        streamRef.current = null;
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        setCameraOpen(false);
    }, [transactionId]);

    useEffect(() => {
        const video = videoRef.current;
        const stream = streamRef.current;
        if (!cameraOpen || !video || !stream) {
            return;
        }
        video.srcObject = stream;
        void video.play();
    }, [cameraOpen]);

    useEffect(() => {
        const host = cornerHostRef.current;
        const source = sourceRef.current;
        const cornerEditorOpen = draft.status === 'needs-corners' || editingCorners;
        if (!cornerEditorOpen || !host || !source) {
            destroyCornerEditor(editorRef);
            return;
        }
        const editor = mountScanicCornerEditor({
            container: host,
            image: source,
            corners: cornersRef.current,
            onConfirm: (corners) => {
                void confirmCornersRef.current?.(corners);
            },
            onCancel: () => {
                setEditingCorners(false);
            },
        });
        editorRef.current = editor;
        return () => {
            editor.destroy();
            editorRef.current = null;
        };
    }, [draft.status, editingCorners]);

    async function openCamera(): Promise<void> {
        setError(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' } },
                audio: false,
            });
            streamRef.current = stream;
            setCameraOpen(true);
        } catch (caught) {
            setError(cameraPermissionMessage(caught));
            setCameraOpen(false);
        }
    }

    async function snap(): Promise<void> {
        const video = videoRef.current;
        if (!video || video.videoWidth === 0) {
            setError('Camera is not ready yet.');
            return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        if (!context) {
            setError('Could not capture a still from the camera.');
            return;
        }
        context.drawImage(video, 0, 0);
        await prepareOriginal(canvas.toDataURL('image/jpeg', RECEIPT_CAPTURE_JPEG_QUALITY), canvas);
    }

    async function pickFiles(files: readonly File[]): Promise<void> {
        const file = files[0];
        if (!file) {
            return;
        }
        setError(null);
        try {
            const original = await fileToDataUrl(file);
            const image = await loadReceiptImageFromDataUrl(original);
            await prepareOriginal(original, image);
        } catch (caught) {
            setError(getBackendErrorMessage(caught, 'Could not read that photo.'));
        }
    }

    async function prepareOriginal(original: string, source: ReceiptScanImage): Promise<void> {
        const generation = ++prepGenerationRef.current;
        destroyCornerEditor(editorRef);
        sourceRef.current = source;
        originalRef.current = original;
        cornersRef.current = null;
        setEditingCorners(false);
        setError(null);
        setDraft((current) => reduceReceiptCaptureDraft(current, { type: 'capture', original }));
        try {
            const result = await scanReceiptImage(source);
            if (generation !== prepGenerationRef.current) {
                return;
            }
            if (result.kind === 'extracted') {
                cornersRef.current = result.corners;
                setDraft((current) =>
                    reduceReceiptCaptureDraft(current, {
                        type: 'extracted',
                        original,
                        processed: result.processedDataUrl,
                    }),
                );
                return;
            }
            setDraft((current) => reduceReceiptCaptureDraft(current, { type: 'no-quad' }));
            setError('Could not find the receipt edges. Drag the corners onto the paper, then apply.');
        } catch (caught) {
            if (generation !== prepGenerationRef.current) {
                return;
            }
            sourceRef.current = null;
            originalRef.current = null;
            cornersRef.current = null;
            setDraft((current) => reduceReceiptCaptureDraft(current, { type: 'failed' }));
            setError(getBackendErrorMessage(caught, 'Could not prepare that photo.'));
        }
    }

    async function confirmCorners(corners: ReceiptScanCorners): Promise<void> {
        const generation = prepGenerationRef.current;
        const source = sourceRef.current;
        const original = originalRef.current;
        if (!source || !original) {
            setError('Could not warp that receipt from the confirmed corners.');
            return;
        }
        try {
            const processed = await extractReceiptImage(source, corners);
            if (generation !== prepGenerationRef.current) {
                return;
            }
            cornersRef.current = corners;
            setEditingCorners(false);
            setError(null);
            setDraft((current) => reduceReceiptCaptureDraft(current, { type: 'extracted', original, processed }));
        } catch (caught) {
            if (generation !== prepGenerationRef.current) {
                return;
            }
            setError(getBackendErrorMessage(caught, 'Could not warp that receipt from the confirmed corners.'));
        }
    }
    confirmCornersRef.current = confirmCorners;

    function adjustCorners(): void {
        if (draft.status === 'empty' || draft.status === 'preparing') {
            return;
        }
        setError(null);
        setEditingCorners(true);
    }

    function discardDraft(): void {
        prepGenerationRef.current += 1;
        destroyCornerEditor(editorRef);
        sourceRef.current = null;
        originalRef.current = null;
        cornersRef.current = null;
        setEditingCorners(false);
        setDraft(EMPTY_RECEIPT_CAPTURE_DRAFT);
        setError(null);
        stopCamera();
    }

    function stopCamera(): void {
        stopStream(streamRef.current);
        streamRef.current = null;
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        setCameraOpen(false);
    }

    function attach(): void {
        if (editingCorners) {
            setError('Finish editing corners first.');
            return;
        }
        if (!canAttachReceiptDraft(draft)) {
            if (draft.status === 'needs-corners') {
                setError('Confirm the receipt corners first.');
                return;
            }
            if (draft.status === 'preparing') {
                setError('Wait until the cropped preview is ready.');
                return;
            }
            setError('Add a photo first.');
            return;
        }
        const body = live
            ? buildCreateReceiptBody({
                  original: draft.original,
                  processed: draft.processed,
                  transactionId,
              })
            : buildExtractPreviewBody({
                  original: draft.original,
                  processed: draft.processed,
              });
        try {
            assertReceiptJsonBodyWithinLimit(body);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : RECEIPT_BODY_TOO_LARGE_MESSAGE);
            return;
        }
        setError(null);
        const images: AttachImages = {
            original: draft.original,
            processed: draft.processed,
            transactionId,
        };
        const afterAttach = () => {
            prepGenerationRef.current += 1;
            destroyCornerEditor(editorRef);
            sourceRef.current = null;
            originalRef.current = null;
            cornersRef.current = null;
            setEditingCorners(false);
            setDraft(EMPTY_RECEIPT_CAPTURE_DRAFT);
            if (!keepCameraOnAttach) {
                stopCamera();
            }
        };
        if (live) {
            liveCreate.mutate(images, { onSuccess: afterAttach });
            return;
        }
        practiceExtract.mutate(images, { onSuccess: afterAttach });
    }

    return {
        canAttach: canAttachReceiptDraft(draft) && !editingCorners,
        cameraOpen,
        cameraSupported,
        cornerEditorOpen: draft.status === 'needs-corners' || editingCorners,
        draftStatus: draft.status,
        editingCorners,
        error: error ?? formatCaptureError(liveCreate.error ?? practiceExtract.error),
        originalPreview: receiptDraftOriginal(draft),
        processedPreview: receiptDraftProcessed(draft),
        submitting: liveCreate.isPending || practiceExtract.isPending,
        cornerHostRef,
        videoRef,
        adjustCorners,
        attach,
        closeCamera: stopCamera,
        discardDraft,
        openCamera,
        pickFiles,
        snap,
    };
}

function destroyCornerEditor(editorRef: { current: { destroy: () => void } | null }): void {
    editorRef.current?.destroy();
    editorRef.current = null;
}

function stopStream(stream: MediaStream | null): void {
    stream?.getTracks().forEach((track) => {
        track.stop();
    });
}

function cameraPermissionMessage(error: unknown): string {
    const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        return 'Camera permission was denied.';
    }
    if (name === 'NotFoundError') {
        return 'No camera was found on this device.';
    }
    return getBackendErrorMessage(error, 'Could not open the camera.');
}

function formatCaptureError(error: unknown): string | null {
    if (!error) {
        return null;
    }
    return getBackendErrorMessage(error, 'Could not attach that receipt.');
}

async function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            resolve(String(reader.result));
        };
        reader.onerror = () => {
            reject(reader.error ?? new Error('Could not read that file.'));
        };
        reader.readAsDataURL(file);
    });
}
