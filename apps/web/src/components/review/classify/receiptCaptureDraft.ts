export type ReceiptCaptureDraft =
    | { readonly status: 'empty' }
    | { readonly status: 'preparing'; readonly original: string }
    | { readonly status: 'ready'; readonly original: string; readonly processed: string }
    | { readonly status: 'needs-corners'; readonly original: string };

export const EMPTY_RECEIPT_CAPTURE_DRAFT: ReceiptCaptureDraft = { status: 'empty' };

export type ReceiptCaptureDraftEvent =
    | { readonly type: 'capture'; readonly original: string }
    | { readonly type: 'extracted'; readonly original: string; readonly processed: string }
    | { readonly type: 'no-quad' }
    | { readonly type: 'failed' }
    | { readonly type: 'discard' };

/**
 * One original still at a time. A new capture replaces any previous original and preview.
 */
export function reduceReceiptCaptureDraft(
    state: ReceiptCaptureDraft,
    event: ReceiptCaptureDraftEvent,
): ReceiptCaptureDraft {
    switch (event.type) {
        case 'capture':
            return { status: 'preparing', original: event.original };
        case 'extracted':
            if (state.status === 'empty' || state.original !== event.original) {
                return state;
            }
            return { status: 'ready', original: state.original, processed: event.processed };
        case 'no-quad':
            if (state.status === 'empty') {
                return state;
            }
            return { status: 'needs-corners', original: state.original };
        case 'failed':
        case 'discard':
            return EMPTY_RECEIPT_CAPTURE_DRAFT;
    }
}

export function canAttachReceiptDraft(
    draft: ReceiptCaptureDraft,
): draft is Extract<ReceiptCaptureDraft, { readonly status: 'ready' }> {
    return draft.status === 'ready';
}

export function receiptDraftOriginal(draft: ReceiptCaptureDraft): string | null {
    return draft.status === 'empty' ? null : draft.original;
}

export function receiptDraftProcessed(draft: ReceiptCaptureDraft): string | null {
    return draft.status === 'ready' ? draft.processed : null;
}
