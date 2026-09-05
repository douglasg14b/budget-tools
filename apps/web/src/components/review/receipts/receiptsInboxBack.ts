export const RECEIPTS_INBOX_FROM_STATE = { fromInbox: true as const };

export type ReceiptsInboxBackTarget =
    | { readonly kind: 'history' }
    | { readonly kind: 'inbox'; readonly pathname: '/receipts'; readonly search: string };

/**
 * Inbox taps pass fromInbox state so Back restores list scroll. Direct loads go to /receipts.
 */
export function receiptsInboxBackTarget(input: {
    readonly search: string;
    readonly fromInbox: boolean;
}): ReceiptsInboxBackTarget {
    if (input.fromInbox) {
        return { kind: 'history' };
    }
    return { kind: 'inbox', pathname: '/receipts', search: input.search };
}

export function isFromReceiptsInbox(state: unknown): boolean {
    return Boolean(
        state &&
            typeof state === 'object' &&
            'fromInbox' in state &&
            (state as { readonly fromInbox?: unknown }).fromInbox === true,
    );
}
