import type { CategorizationQueueItemDto } from '@budget-tools/web-sdk';

import { isCertainProposal } from '../classify/isCertainProposal';
import type { SessionDecision } from '../classify/sessionDecisions';
import { isSplitDecision } from '../classify/sessionDecisions';

/**
 * Rows the Certain view lists: every 100% suggestion, decided or not, so accepted rows stay put
 * (dimmed) instead of jumping out from under the thumb.
 */
export function certainItems(items: readonly CategorizationQueueItemDto[]): CategorizationQueueItemDto[] {
    return items.filter((item) => isCertainProposal(item.proposal));
}

/**
 * Second-line category: the decision once made, otherwise the model's suggestion. Category name
 * only — on a phone the group prefix crowds out the name; the full card still shows both.
 */
export function rowCategoryLabel(
    item: CategorizationQueueItemDto,
    decision: SessionDecision | undefined,
): string | null {
    if (decision) {
        return decisionSummary(decision);
    }
    return item.proposal?.suggestedCategory ?? null;
}

/** Short past-tense label for a decision, for rows and the undo toast. */
export function decisionSummary(decision: SessionDecision): string {
    if (isSplitDecision(decision)) {
        return `Split into ${decision.lines.length}`;
    }
    switch (decision.action) {
        case 'approved':
            return `Accepted${categorySuffix(decision)}`;
        case 'changed':
            return `Changed${categorySuffix(decision)}`;
        case 'rejected':
            return 'Rejected';
        case 'annotated':
            return 'Skipped with note';
    }
}

/** The list can accept in one tap only when there is a suggestion and nothing decided yet. */
export function canQuickAccept(item: CategorizationQueueItemDto, decision: SessionDecision | undefined): boolean {
    return !decision && Boolean(item.proposal?.suggestedCategory);
}

/** `Oct 8` for a `YYYY-MM-DD` date; the year only when it is not the current one. */
export function formatShortDate(isoDate: string, today: Date = new Date()): string {
    const [year, month, day] = isoDate.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        ...(year === today.getFullYear() ? {} : { year: '2-digit' }),
    });
}

function categorySuffix(decision: SessionDecision): string {
    return decision.kind === 'category' && decision.categoryName ? ` · ${decision.categoryName}` : '';
}
