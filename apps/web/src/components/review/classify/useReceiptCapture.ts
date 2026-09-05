import type { ReceiptDto } from '@budget-tools/web-sdk';
import { listReceiptsQueryKey, Receipts } from '@budget-tools/web-sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';

import { getBackendErrorMessage } from '../../BackendErrorNotice';
import type { LiveReceiptOutline } from './liveReceiptOutline';
import { LIVE_RECEIPT_OUTLINE_MS } from './liveReceiptOutline';
import type { PracticeReceipt } from './practiceReceipts';
import { practiceReceiptFromExtract } from './practiceReceipts';
import { openReceiptCameraStream } from './receiptCamera';
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
import { decodeReceiptStill, takeReceiptStillBlob } from './receiptStillCapture';
import type { ReceiptScanCorners, ReceiptScanImage } from './scanicReceiptPrep';
import {
    extractReceiptImage,
    loadReceiptImageFromDataUrl,
    mountScanicCornerEditor,
    RECEIPT_CAPTURE_JPEG_QUALITY,
    scanReceiptImage,
    warmupReceiptMlDetector,
} from './scanicReceiptPrep';
import { drawCoverFrame, drawVideoCoverFrame } from './videoCoverCrop';

type UseReceiptCaptureInput = {
    readonly live: boolean;
    readonly transactionId: string | null;
    readonly keepCameraOnAttach?: boolean;
    readonly onLiveCreated?: (row: ReceiptDto) => void;
    readonly onPracticeReceipt: (receipt: PracticeReceipt) => void;
};

export type ReceiptCaptureSession = 'idle' | 'camera' | 'review';

export type ReceiptCaptureState = {
    readonly canAttach: boolean;
    readonly cameraSupported: boolean;
    readonly cameraReady: boolean;
    readonly snapping: boolean;
    readonly confirming: boolean;
    readonly cornerEditorOpen: boolean;
    readonly draftStatus: ReceiptCaptureDraft['status'];
    readonly editingCorners: boolean;
    readonly error: string | null;
    readonly liveOutline: LiveReceiptOutline | null;
    readonly originalPreview: string | null;
    readonly processedPreview: string | null;
    readonly session: ReceiptCaptureSession;
    readonly submitting: boolean;
    readonly cornerHostRef: RefObject<HTMLDivElement | null>;
    readonly videoRef: RefObject<HTMLVideoElement | null>;
    readonly adjustCorners: () => void;
    readonly attach: () => void;
    readonly cancelSession: () => void;
    readonly confirmReview: () => void;
    readonly discardDraft: () => void;
    readonly openCamera: () => void;
    readonly pickFiles: (files: readonly File[]) => void;
    readonly retake: () => void;
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
    const editorRef = useRef<{ confirm: () => ReceiptScanCorners; destroy: () => void } | null>(null);
    const prepGenerationRef = useRef(0);
    const cameraGenerationRef = useRef(0);
    const confirmCornersRef = useRef<((corners: ReceiptScanCorners) => Promise<void>) | null>(null);
    const cancelSessionRef = useRef<(() => void) | null>(null);
    const [draft, setDraft] = useState<ReceiptCaptureDraft>(EMPTY_RECEIPT_CAPTURE_DRAFT);
    const [editingCorners, setEditingCorners] = useState(false);
    const [session, setSession] = useState<ReceiptCaptureSession>('idle');
    const [cameraNonce, setCameraNonce] = useState(0);
    const [cameraReady, setCameraReady] = useState(false);
    const [liveOutline, setLiveOutline] = useState<LiveReceiptOutline | null>(null);
    const [snapping, setSnapping] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const cameraSupported =
        typeof navigator !== 'undefined' && window.isSecureContext && Boolean(navigator.mediaDevices?.getUserMedia);

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
        setConfirming(false);
        setError(null);
        sourceRef.current = null;
        originalRef.current = null;
        cornersRef.current = null;
        destroyCornerEditor(editorRef);
        cameraGenerationRef.current += 1;
        stopStream(streamRef.current);
        streamRef.current = null;
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        setCameraReady(false);
        setSession('idle');
    }, [transactionId]);

    useEffect(() => {
        const video = videoRef.current;
        const stream = streamRef.current;
        if (session !== 'camera' || !video || !stream) {
            return;
        }
        video.srcObject = stream;
        void video.play();
    }, [session, cameraNonce]);

    useEffect(() => {
        if (session !== 'camera' || !cameraReady) {
            setLiveOutline(null);
            return;
        }
        const canvas = document.createElement('canvas');
        let cancelled = false;
        let inflight = false;
        let liveFailed = false;
        async function detectLiveOutline(): Promise<void> {
            const video = videoRef.current;
            if (cancelled || inflight || liveFailed || !video) {
                return;
            }
            inflight = true;
            try {
                if (!drawVideoCoverFrame(video, canvas)) {
                    return;
                }
                const result = await scanReceiptImage(canvas);
                if (cancelled) {
                    return;
                }
                if (result.kind === 'detected') {
                    setLiveOutline({
                        corners: result.corners,
                        height: canvas.height,
                        width: canvas.width,
                    });
                    return;
                }
                setLiveOutline(null);
            } catch (caught) {
                liveFailed = true;
                if (cancelled) {
                    return;
                }
                setLiveOutline(null);
                setError(getBackendErrorMessage(caught, 'Could not load the receipt corner detector.'));
            } finally {
                inflight = false;
            }
        }
        void detectLiveOutline();
        const timer = window.setInterval(() => {
            void detectLiveOutline();
        }, LIVE_RECEIPT_OUTLINE_MS);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [cameraReady, session]);

    useEffect(() => {
        const host = cornerHostRef.current;
        const source = sourceRef.current;
        const cornerEditorOpen = draft.status === 'needs-corners' || editingCorners;
        if (session !== 'review' || !cornerEditorOpen || !host || !source) {
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
                cancelSessionRef.current?.();
            },
        });
        editorRef.current = editor;
        return () => {
            editor.destroy();
            editorRef.current = null;
        };
    }, [draft.status, editingCorners, session]);

    async function openCamera(): Promise<void> {
        setError(null);
        stopStream(streamRef.current);
        streamRef.current = null;
        setCameraReady(false);
        setSession('camera');
        const generation = ++cameraGenerationRef.current;
        void warmupReceiptMlDetector().catch((caught: unknown) => {
            if (generation !== cameraGenerationRef.current) {
                return;
            }
            setError(getBackendErrorMessage(caught, 'Could not load the receipt corner detector.'));
        });
        try {
            const stream = await openReceiptCameraStream();
            if (generation !== cameraGenerationRef.current) {
                stopStream(stream);
                return;
            }
            streamRef.current = stream;
            setCameraReady(true);
            setCameraNonce((current) => current + 1);
        } catch (caught) {
            if (generation !== cameraGenerationRef.current) {
                return;
            }
            setError(cameraPermissionMessage(caught));
            setSession('idle');
        }
    }

    async function snap(): Promise<void> {
        const video = videoRef.current;
        const track = streamRef.current?.getVideoTracks()[0];
        if (!video || !track || snapping) {
            if (!video || !track) {
                setError('Camera is not ready yet.');
            }
            return;
        }
        setSnapping(true);
        setError(null);
        const generation = cameraGenerationRef.current;
        const displayWidth = video.clientWidth;
        const displayHeight = video.clientHeight;
        try {
            const blob = await takeReceiptStillBlob(track);
            if (generation !== cameraGenerationRef.current) {
                return;
            }
            const bitmap = await decodeReceiptStill(blob);
            if (generation !== cameraGenerationRef.current) {
                bitmap.close();
                return;
            }
            const canvas = document.createElement('canvas');
            const cropped = drawCoverFrame(bitmap, bitmap.width, bitmap.height, canvas, displayWidth, displayHeight);
            bitmap.close();
            if (generation !== cameraGenerationRef.current) {
                return;
            }
            if (!cropped) {
                setError('Could not read that still photo.');
                return;
            }
            stopCamera();
            setSession('review');
            await prepareOriginal(canvas.toDataURL('image/jpeg', RECEIPT_CAPTURE_JPEG_QUALITY), canvas);
        } catch (caught) {
            if (generation !== cameraGenerationRef.current) {
                return;
            }
            setError(getBackendErrorMessage(caught, 'Could not take a still photo.'));
        } finally {
            if (generation === cameraGenerationRef.current) {
                setSnapping(false);
            }
        }
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
            setSession('review');
            await prepareOriginal(original, image);
        } catch (caught) {
            setError(getBackendErrorMessage(caught, 'Could not read that photo.'));
            setSession('idle');
        }
    }

    async function prepareOriginal(original: string, source: ReceiptScanImage): Promise<void> {
        const generation = ++prepGenerationRef.current;
        destroyCornerEditor(editorRef);
        sourceRef.current = source;
        originalRef.current = original;
        cornersRef.current = null;
        setEditingCorners(false);
        setConfirming(false);
        setError(null);
        setSession('review');
        setDraft((current) => reduceReceiptCaptureDraft(current, { type: 'capture', original }));
        try {
            const result = await scanReceiptImage(source);
            if (generation !== prepGenerationRef.current) {
                return;
            }
            if (result.kind === 'detected') {
                cornersRef.current = result.corners;
            } else {
                cornersRef.current = null;
                setError('Could not find the receipt edges. Drag the corners onto the paper, then submit.');
            }
            setDraft((current) => reduceReceiptCaptureDraft(current, { type: 'review' }));
        } catch (caught) {
            if (generation !== prepGenerationRef.current) {
                return;
            }
            sourceRef.current = null;
            originalRef.current = null;
            cornersRef.current = null;
            setDraft((current) => reduceReceiptCaptureDraft(current, { type: 'failed' }));
            setError(getBackendErrorMessage(caught, 'Could not prepare that photo.'));
            setSession('idle');
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
        setConfirming(true);
        try {
            const processed = await extractReceiptImage(source, corners);
            if (generation !== prepGenerationRef.current) {
                return;
            }
            cornersRef.current = corners;
            setEditingCorners(false);
            setError(null);
            setDraft((current) => reduceReceiptCaptureDraft(current, { type: 'extracted', original, processed }));
            submitReadyImages({ original, processed });
        } catch (caught) {
            if (generation !== prepGenerationRef.current) {
                return;
            }
            setError(getBackendErrorMessage(caught, 'Could not warp that receipt from the confirmed corners.'));
        } finally {
            if (generation === prepGenerationRef.current) {
                setConfirming(false);
            }
        }
    }
    confirmCornersRef.current = confirmCorners;

    function confirmReview(): void {
        const editor = editorRef.current;
        if (editor) {
            editor.confirm();
            return;
        }
        const corners = cornersRef.current;
        if (corners) {
            void confirmCorners(corners);
            return;
        }
        setError('Set the four corners on the paper, then submit.');
    }

    function adjustCorners(): void {
        if (draft.status === 'empty' || draft.status === 'preparing') {
            return;
        }
        setError(null);
        setEditingCorners(true);
        setSession('review');
    }

    function resetDraft(): void {
        prepGenerationRef.current += 1;
        destroyCornerEditor(editorRef);
        sourceRef.current = null;
        originalRef.current = null;
        cornersRef.current = null;
        setEditingCorners(false);
        setConfirming(false);
        setDraft(EMPTY_RECEIPT_CAPTURE_DRAFT);
        setError(null);
        stopCamera();
    }

    function discardDraft(): void {
        resetDraft();
        setSession('idle');
    }

    function cancelSession(): void {
        if (editingCorners && draft.status === 'ready') {
            setEditingCorners(false);
            setError(null);
            setSession('idle');
            return;
        }
        if (session === 'camera') {
            stopCamera();
            setSession('idle');
            return;
        }
        discardDraft();
    }
    cancelSessionRef.current = cancelSession;

    function retake(): void {
        resetDraft();
        void openCamera();
    }

    function stopCamera(): void {
        cameraGenerationRef.current += 1;
        stopStream(streamRef.current);
        streamRef.current = null;
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        setCameraReady(false);
        setLiveOutline(null);
        setSnapping(false);
    }

    function attach(): void {
        if (editingCorners || session === 'review') {
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
        submitReadyImages({ original: draft.original, processed: draft.processed });
    }

    function submitReadyImages(images: { readonly original: string; readonly processed: string }): void {
        const body = live
            ? buildCreateReceiptBody({
                  original: images.original,
                  processed: images.processed,
                  transactionId,
              })
            : buildExtractPreviewBody({
                  original: images.original,
                  processed: images.processed,
              });
        try {
            assertReceiptJsonBodyWithinLimit(body);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : RECEIPT_BODY_TOO_LARGE_MESSAGE);
            return;
        }
        setError(null);
        const payload: AttachImages = {
            original: images.original,
            processed: images.processed,
            transactionId,
        };
        const afterAttach = () => {
            resetDraft();
            if (keepCameraOnAttach) {
                void openCamera();
                return;
            }
            setSession('idle');
        };
        if (live) {
            liveCreate.mutate(payload, { onSuccess: afterAttach });
            return;
        }
        practiceExtract.mutate(payload, { onSuccess: afterAttach });
    }

    return {
        canAttach: canAttachReceiptDraft(draft) && !editingCorners && session === 'idle',
        cameraSupported,
        cameraReady,
        snapping,
        confirming,
        cornerEditorOpen: (draft.status === 'needs-corners' || editingCorners) && session === 'review',
        draftStatus: draft.status,
        editingCorners,
        error: error ?? formatCaptureError(liveCreate.error ?? practiceExtract.error),
        liveOutline,
        originalPreview: receiptDraftOriginal(draft),
        processedPreview: receiptDraftProcessed(draft),
        session,
        submitting: liveCreate.isPending || practiceExtract.isPending,
        cornerHostRef,
        videoRef,
        adjustCorners,
        attach,
        cancelSession,
        confirmReview,
        discardDraft,
        openCamera,
        pickFiles,
        retake,
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
    if (name === 'SecurityError' || name === 'NotSupportedError') {
        return 'Camera needs HTTPS. Open the Network URL that starts with https://';
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
