import type { ReceiptDto } from '@budget-tools/web-sdk';

export type ReceiptBindStatus = Pick<ReceiptDto, 'bindSource' | 'bindJevScore' | 'bindCheckedAt' | 'bindCheckOutcome'>;

const CHECK_OUTCOME_COPY: Record<NonNullable<ReceiptDto['bindCheckOutcome']>, string> = {
    bound: 'bound it',
    'no-candidate': 'no charge with this exact total yet',
    'not-confirmed': 'a charge matched the total, but Jev did not confirm it',
    ambiguous: 'more than one charge looked right, so it waited for you',
    'jev-unavailable': 'Jev was unavailable; it will try again',
    'lost-race': 'someone bound it at the same time',
};

/** "Auto-bound · Jev 96%", "Bound by you", "Bound at capture". */
export function describeBoundSource(status: ReceiptBindStatus): string | null {
    switch (status.bindSource) {
        case 'auto':
            return status.bindJevScore == null
                ? 'Auto-bound'
                : `Auto-bound · Jev ${Math.round(status.bindJevScore * 100)}% sure`;
        case 'manual':
            return 'Bound by you';
        case 'capture':
            return 'Bound at capture';
        default:
            return null;
    }
}

function relativeTime(iso: string, now: Date): string {
    const minutes = Math.round((now.getTime() - Date.parse(iso)) / 60_000);
    if (!Number.isFinite(minutes) || minutes < 1) {
        return 'just now';
    }
    if (minutes < 60) {
        return `${minutes} min ago`;
    }
    const hours = Math.round(minutes / 60);
    return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}

/** "Auto-bind checked 4 min ago: no charge with this exact total yet." Null before the first check. */
export function describeLastBindCheck(status: ReceiptBindStatus, now: Date = new Date()): string | null {
    if (!status.bindCheckedAt || !status.bindCheckOutcome || status.bindCheckOutcome === 'bound') {
        return null;
    }
    return `Auto-bind checked ${relativeTime(status.bindCheckedAt, now)}: ${CHECK_OUTCOME_COPY[status.bindCheckOutcome]}.`;
}
