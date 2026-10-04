import { QueryValidationError } from '../categorization/filterQueue';
import type { YnabFlagColor } from './ynabFlagColor';
import { isYnabFlagColor, YNAB_FLAG_COLORS } from './ynabFlagColor';
import type { ClassificationDecisionDto, ClassificationDecisionLineDto } from './ynabSyncDtos';

/** YNAB rejects parent memos longer than this. */
export const YNAB_MEMO_MAX_LENGTH = 500;

/**
 * Parent memo and flag edits. An absent field leaves YNAB's value alone; null clears it.
 * Only what the reviewer changed is sent, so concurrent YNAB-side edits are not clobbered.
 */
export type ClassificationAnnotations = {
    readonly memo?: string | null;
    readonly flagColor?: YnabFlagColor | null;
};

export type ClassificationCategoryDecision = ClassificationAnnotations & {
    readonly kind: 'category';
    readonly categoryId: string;
    readonly payeeName?: string;
};

export type ClassificationSplitLine = {
    readonly amount: number;
    readonly categoryId: string;
    readonly memo: string | null;
};

export type ClassificationSplitDecision = ClassificationAnnotations & {
    readonly kind: 'split';
    readonly lines: readonly ClassificationSplitLine[];
    readonly payeeName?: string;
};

/** Memo and/or flag only. Leaves the category alone and keeps the transaction in the review queue. */
export type ClassificationAnnotateDecision = ClassificationAnnotations & {
    readonly kind: 'annotate';
    /**
     * Mirrored YNAB approval when the decision was recorded. YNAB unapproves a PATCHed
     * transaction that omits `approved`, so the flush re-sends the current value.
     */
    readonly approved: boolean;
};

export type ClassificationDecision =
    | ClassificationCategoryDecision
    | ClassificationSplitDecision
    | ClassificationAnnotateDecision;

/** An annotation before the mirrored approval is attached. */
export type ClassificationAnnotateDraft = Omit<ClassificationAnnotateDecision, 'approved'>;

/** A parsed request decision. Annotations still need the mirrored approval; see `completeClassificationDecision`. */
export type ClassificationDecisionDraft =
    | ClassificationCategoryDecision
    | ClassificationSplitDecision
    | ClassificationAnnotateDraft;

/** The mirrored transaction's current memo and flag. */
export type MirroredAnnotations = {
    readonly memo: string | null;
    readonly flagColor: YnabFlagColor | null;
};

/**
 * Parses a request DTO into a classification decision draft. Invalid shapes fail loud.
 */
export function parseClassificationDecision(dto: ClassificationDecisionDto): ClassificationDecisionDraft {
    if (!dto.transactionId.trim()) {
        throw new QueryValidationError('transactionId is required');
    }
    const annotations = parseAnnotations(dto);
    if (dto.kind === 'annotate') {
        if (dto.categoryId || dto.lines?.length || dto.payeeName) {
            throw new QueryValidationError('annotate decisions cannot include categoryId, lines, or payeeName');
        }
        if (annotations.memo === undefined && annotations.flagColor === undefined) {
            throw new QueryValidationError('annotate decisions need a memo or flagColor');
        }
        return { kind: 'annotate', ...annotations };
    }
    const payeeName = optionalPayeeName(dto.payeeName);
    const payee = payeeName ? { payeeName } : {};
    if (dto.kind === 'category') {
        const categoryId = dto.categoryId?.trim();
        if (!categoryId) {
            throw new QueryValidationError('categoryId is required for category decisions');
        }
        if (dto.lines && dto.lines.length > 0) {
            throw new QueryValidationError('category decisions cannot include split lines');
        }
        return { kind: 'category', categoryId, ...payee, ...annotations };
    }
    if (dto.kind === 'split') {
        if (dto.categoryId) {
            throw new QueryValidationError('split decisions cannot include a parent categoryId');
        }
        const lines = parseSplitLines(dto.lines);
        return { kind: 'split', lines, ...payee, ...annotations };
    }
    throw new QueryValidationError("kind must be 'category', 'split', or 'annotate'");
}

/**
 * Validates category ids against the assignable catalog and split milliunit totals.
 * Annotations carry no category, so they need no catalog check.
 */
export function validateClassificationDecision(
    decision: ClassificationDecisionDraft,
    transactionAmount: number,
    assignableCategoryIds: ReadonlySet<string>,
): void {
    if (decision.kind === 'annotate') {
        return;
    }
    if (decision.kind === 'category') {
        assertAssignableCategory(decision.categoryId, assignableCategoryIds);
        return;
    }
    if (decision.lines.length === 0) {
        throw new QueryValidationError('split decisions need at least one line');
    }
    let total = 0;
    for (const line of decision.lines) {
        assertAssignableCategory(line.categoryId, assignableCategoryIds);
        total += line.amount;
    }
    if (total !== transactionAmount) {
        throw new QueryValidationError('split amounts must sum to the transaction amount');
    }
}

/**
 * Attaches the transaction's mirrored approval to an annotation so the flush is self-contained.
 */
export function completeClassificationDecision(
    draft: ClassificationDecisionDraft,
    mirroredApproved: boolean,
): ClassificationDecision {
    return draft.kind === 'annotate' ? { ...draft, approved: mirroredApproved } : draft;
}

/**
 * True when the mirror shows every memo/flag the annotation sent. Absent fields are ignored.
 */
export function isAnnotationMirrored(decision: ClassificationAnnotateDecision, mirror: MirroredAnnotations): boolean {
    const memoMatches = decision.memo === undefined || decision.memo === (mirror.memo || null);
    const flagMatches = decision.flagColor === undefined || decision.flagColor === mirror.flagColor;
    return memoMatches && flagMatches;
}

function parseAnnotations(dto: ClassificationDecisionDto): ClassificationAnnotations {
    return {
        ...(dto.memo === undefined ? {} : { memo: parseParentMemo(dto.memo) }),
        ...(dto.flagColor === undefined ? {} : { flagColor: parseFlagColor(dto.flagColor) }),
    };
}

function parseParentMemo(memo: string | null): string | null {
    const trimmed = memo?.trim();
    if (!trimmed) {
        return null;
    }
    if (trimmed.length > YNAB_MEMO_MAX_LENGTH) {
        throw new QueryValidationError(`memo must be at most ${YNAB_MEMO_MAX_LENGTH} characters`);
    }
    return trimmed;
}

function parseFlagColor(flagColor: YnabFlagColor | null): YnabFlagColor | null {
    if (flagColor === null) {
        return null;
    }
    if (!isYnabFlagColor(flagColor)) {
        throw new QueryValidationError(`flagColor must be one of ${YNAB_FLAG_COLORS.join(', ')}, or null`);
    }
    return flagColor;
}

function parseSplitLines(lines: ClassificationDecisionLineDto[] | undefined): ClassificationSplitLine[] {
    if (!lines || lines.length === 0) {
        throw new QueryValidationError('split decisions need at least one line');
    }
    return lines.map((line, index) => {
        if (!Number.isInteger(line.amount)) {
            throw new QueryValidationError(`split line ${index + 1} amount must be an integer milliunit value`);
        }
        const categoryId = line.categoryId.trim();
        if (!categoryId) {
            throw new QueryValidationError(`split line ${index + 1} needs a categoryId`);
        }
        return {
            amount: line.amount,
            categoryId,
            memo: line.memo?.trim() ? line.memo.trim() : null,
        };
    });
}

function optionalPayeeName(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed || undefined;
}

function assertAssignableCategory(categoryId: string, assignableCategoryIds: ReadonlySet<string>): void {
    if (!assignableCategoryIds.has(categoryId)) {
        throw new QueryValidationError(`category ${categoryId} is not assignable`);
    }
}
