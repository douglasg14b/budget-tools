import type { ReceiptBindCheckOutcome, ReceiptExtractStatus } from './data/receiptsSchema';
import { parseReceiptExtract } from './parseReceiptExtract';

/**
 * Something stored on a receipt that says it needs a person. Each is a recorded fact, never a guess:
 * - `unreadable`: the extract failed (vendor, date, or total missing).
 * - `needs-look`: the extract finished but its amounts don't add up, or the two printed reads disagree.
 * - `flagged`: the extract finished but a step errored or the verify pass flagged it.
 * - `extracting`: the extract hasn't finished.
 * - `bind-*`: unbound, and the last auto-bind check stopped for this reason.
 */
export type ReceiptIssue =
    | 'unreadable'
    | 'needs-look'
    | 'flagged'
    | 'extracting'
    | 'bind-ambiguous'
    | 'bind-not-confirmed'
    | 'bind-jev-unavailable'
    | 'bind-no-charge';

/** `any` is every issue except the ones a fresh receipt has while it waits: extracting and no charge yet. */
export type ReceiptIssueFilter = 'any' | ReceiptIssue;

const WAITING_ISSUES: ReadonlySet<ReceiptIssue> = new Set(['extracting', 'bind-no-charge']);

const BIND_CHECK_ISSUES: Partial<Record<ReceiptBindCheckOutcome, ReceiptIssue>> = {
    ambiguous: 'bind-ambiguous',
    'not-confirmed': 'bind-not-confirmed',
    'jev-unavailable': 'bind-jev-unavailable',
    'no-candidate': 'bind-no-charge',
};

export type ReceiptIssueFields = {
    readonly extractStatus: ReceiptExtractStatus;
    readonly extractJson: string | null;
    readonly totalsDisagree: boolean;
    readonly transactionId: string | null;
    readonly bindCheckOutcome: ReceiptBindCheckOutcome | null;
};

export function receiptIssues(receipt: ReceiptIssueFields): ReceiptIssue[] {
    const issues: ReceiptIssue[] = [];
    switch (receipt.extractStatus) {
        case 'pending':
            issues.push('extracting');
            break;
        case 'failed':
            issues.push('unreadable');
            break;
        case 'ungated':
        case 'gated':
            if (receipt.extractStatus === 'ungated' || receipt.totalsDisagree) {
                issues.push('needs-look');
            }
            if (extractFlagged(receipt.extractJson)) {
                issues.push('flagged');
            }
            // Binding or detaching by hand leaves the last check in place, so it only speaks for unbound rows.
            if (!receipt.transactionId && receipt.bindCheckOutcome) {
                const bindIssue = BIND_CHECK_ISSUES[receipt.bindCheckOutcome];
                if (bindIssue) {
                    issues.push(bindIssue);
                }
            }
            break;
    }
    return issues;
}

export function receiptHasIssue(receipt: ReceiptIssueFields, filter: ReceiptIssueFilter): boolean {
    const issues = receiptIssues(receipt);
    return filter === 'any' ? issues.some((issue) => !WAITING_ISSUES.has(issue)) : issues.includes(filter);
}

function extractFlagged(extractJson: string | null): boolean {
    const extract = parseReceiptExtract(extractJson);
    return Boolean(extract?.error) || (extract?.verifyFlags?.length ?? 0) > 0;
}
