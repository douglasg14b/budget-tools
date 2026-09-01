import type { ReceiptDto } from '@budget-tools/web-sdk';
import { listReceiptsQueryKey, Receipts } from '@budget-tools/web-sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';

import { getBackendErrorMessage } from '../../BackendErrorNotice';
import type { PracticeReceipt } from './practiceReceipts';
import { practiceReceiptFromExtract } from './practiceReceipts';

/** Must match API MAX_RECEIPT_FRAMES. */
export const MAX_RECEIPT_FRAMES = 8;

type UseReceiptCaptureInput = {
    readonly live: boolean;
    readonly transactionId: string | null;
    readonly keepCameraOnAttach?: boolean;
    readonly onLiveCreated?: (row: ReceiptDto) => void;
    readonly onPracticeReceipt: (receipt: PracticeReceipt) => void;
};

export type ReceiptCaptureState = {
    readonly cameraOpen: boolean;
    readonly cameraSupported: boolean;
    readonly draftCount: number;
    readonly error: string | null;
    readonly submitting: boolean;
    readonly videoRef: RefObject<HTMLVideoElement | null>;
    readonly attach: () => void;
    readonly closeCamera: () => void;
    readonly discardDraft: () => void;
    readonly openCamera: () => void;
    readonly pickFiles: (files: readonly File[]) => void;
    readonly snap: () => void;
};

/**
 * Card or inbox capture: one receipt is one frames array. Live POSTs create; Practice uses extract-preview.
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
    const [draft, setDraft] = useState<string[]>([]);
    const [cameraOpen, setCameraOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const cameraSupported = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

    const liveCreate = useMutation({
        mutationFn: async (input: { readonly frames: readonly string[]; readonly transactionId: string | null }) => {
            const result = await Receipts.request2({
                body: {
                    frames: [...input.frames],
                    ...(input.transactionId ? { transactionId: input.transactionId } : {}),
                },
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
        mutationFn: async (input: { readonly frames: readonly string[]; readonly transactionId: string | null }) => {
            const result = await Receipts.request6({
                body: { frames: [...input.frames] },
                throwOnError: true,
            });
            if (!result.data) {
                throw new Error('Extract preview returned no data');
            }
            return result.data;
        },
        onSuccess: (extract, input) => {
            const receipt = practiceReceiptFromExtract(crypto.randomUUID(), input.transactionId, input.frames, extract);
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
        };
    }, []);

    useEffect(() => {
        setDraft([]);
        setError(null);
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
        if (draft.length >= MAX_RECEIPT_FRAMES) {
            setError(`A receipt can have at most ${MAX_RECEIPT_FRAMES} frames.`);
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
        const still = canvas.toDataURL('image/jpeg', 0.92);
        setDraft((frames) => (frames.length >= MAX_RECEIPT_FRAMES ? frames : [...frames, still]));
    }

    async function pickFiles(files: readonly File[]): Promise<void> {
        setError(null);
        try {
            const urls = await Promise.all(files.map(fileToDataUrl));
            setDraft((frames) => {
                const remaining = MAX_RECEIPT_FRAMES - frames.length;
                if (remaining <= 0) {
                    return frames;
                }
                return [...frames, ...urls.slice(0, remaining)];
            });
        } catch (caught) {
            setError(getBackendErrorMessage(caught, 'Could not read that photo.'));
        }
    }

    function discardDraft(): void {
        setDraft([]);
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
        if (draft.length === 0) {
            setError('Add a photo first.');
            return;
        }
        setError(null);
        const frames = draft;
        const attachedTo = transactionId;
        const afterAttach = () => {
            setDraft([]);
            if (!keepCameraOnAttach) {
                stopCamera();
            }
        };
        if (live) {
            liveCreate.mutate(
                { frames, transactionId: attachedTo },
                {
                    onSuccess: afterAttach,
                },
            );
            return;
        }
        practiceExtract.mutate(
            { frames, transactionId: attachedTo },
            {
                onSuccess: afterAttach,
            },
        );
    }

    return {
        cameraOpen,
        cameraSupported,
        draftCount: draft.length,
        error: error ?? formatCaptureError(liveCreate.error ?? practiceExtract.error),
        submitting: liveCreate.isPending || practiceExtract.isPending,
        videoRef,
        attach,
        closeCamera: stopCamera,
        discardDraft,
        openCamera,
        pickFiles,
        snap,
    };
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
