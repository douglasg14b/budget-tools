import type {
    ReceiptBindCheckOutcome,
    ReceiptExtractStatus,
    ReceiptIssue,
    ReceiptIssueFilter,
} from '@budget-tools/web-sdk';

import type { ReceiptVerifyFlag } from './parseReceiptExtract';
import { parseReceiptExtract } from './parseReceiptExtract';
import { CHECK_OUTCOME_COPY } from './receiptBindStatusCopy';

/** Picker order and labels; `any` first. */
export const RECEIPT_ISSUE_OPTIONS: readonly { value: ReceiptIssueFilter; label: string }[] = [
    { value: 'any', label: 'Any problem' },
    { value: 'unreadable', label: 'Couldn’t read' },
    { value: 'needs-look', label: 'Amounts don’t add up' },
    { value: 'flagged', label: 'Read errors or flags' },
    { value: 'bind-ambiguous', label: 'Auto-bind: more than one charge' },
    { value: 'bind-not-confirmed', label: 'Auto-bind: Jev didn’t confirm' },
    { value: 'bind-jev-unavailable', label: 'Auto-bind: Jev unavailable' },
    { value: 'bind-no-charge', label: 'Auto-bind: no charge yet' },
    { value: 'extracting', label: 'Still extracting' },
];

const ISSUE_FILTERS: ReadonlySet<string> = new Set(RECEIPT_ISSUE_OPTIONS.map((option) => option.value));

export function isReceiptIssueFilter(value: string | null): value is ReceiptIssueFilter {
    return value !== null && ISSUE_FILTERS.has(value);
}

const WAITING_ISSUES: ReadonlySet<ReceiptIssue> = new Set(['extracting', 'bind-no-charge']);

const BIND_CHECK_ISSUES: Partial<Record<ReceiptBindCheckOutcome, ReceiptIssue>> = {
    ambiguous: 'bind-ambiguous',
    'not-confirmed': 'bind-not-confirmed',
    'jev-unavailable': 'bind-jev-unavailable',
    'no-candidate': 'bind-no-charge',
};

export type ReceiptIssueFields = {
    readonly extractStatus: ReceiptExtractStatus | null;
    readonly extractJson: string | null;
    readonly totalsDisagree: boolean;
    readonly transactionId: string | null;
    /** Absent on Practice receipts, which never auto-bind. */
    readonly bindCheckOutcome?: ReceiptBindCheckOutcome | null;
};

/** Mirrors the API's `receiptIssues`: what's recorded on the receipt that needs a person. */
export function receiptIssues(receipt: ReceiptIssueFields): ReceiptIssue[] {
    const issues: ReceiptIssue[] = [];
    switch (receipt.extractStatus) {
        case 'pending':
        case null:
            issues.push('extracting');
            break;
        case 'failed':
            issues.push('unreadable');
            break;
        case 'ungated':
        case 'gated': {
            if (receipt.extractStatus === 'ungated' || receipt.totalsDisagree) {
                issues.push('needs-look');
            }
            const extract = parseReceiptExtract(receipt.extractJson);
            if (extract?.error || (extract?.verifyFlags?.length ?? 0) > 0) {
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
    }
    return issues;
}

/** `any` leaves out the states a fresh receipt passes through: extracting and no charge yet. */
export function receiptHasIssue(receipt: ReceiptIssueFields, filter: ReceiptIssueFilter): boolean {
    const issues = receiptIssues(receipt);
    return filter === 'any' ? issues.some((issue) => !WAITING_ISSUES.has(issue)) : issues.includes(filter);
}

const VERIFY_FLAG_NOTE: Readonly<Record<ReceiptVerifyFlag, string>> = {
    'vendor-suspect': 'Store name may be misread.',
    'discount-double-counted': 'A discount may be counted twice.',
};

/**
 * One line per flag or stalled auto-bind, for the inbox slip; the status line already covers
 * unreadable, amounts that don't add up, and extracting.
 */
export function receiptIssueNotes(receipt: ReceiptIssueFields): string[] {
    const issues = receiptIssues(receipt);
    const notes: string[] = [];
    if (issues.includes('flagged')) {
        const extract = parseReceiptExtract(receipt.extractJson);
        if (extract?.error) {
            notes.push('A read step hit an error.');
        }
        for (const flag of extract?.verifyFlags ?? []) {
            notes.push(VERIFY_FLAG_NOTE[flag]);
        }
    }
    if (issues.some((issue) => issue.startsWith('bind-')) && receipt.bindCheckOutcome) {
        notes.push(`Auto-bind: ${CHECK_OUTCOME_COPY[receipt.bindCheckOutcome]}.`);
    }
    return notes;
}
