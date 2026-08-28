import { QueryValidationError } from '../categorization/filterQueue';
import type { ClassificationDecisionDto, ClassificationDecisionLineDto } from './ynabSyncDtos';

export type ClassificationCategoryDecision = {
    readonly kind: 'category';
    readonly categoryId: string;
    readonly payeeName?: string;
};

export type ClassificationSplitLine = {
    readonly amount: number;
    readonly categoryId: string;
    readonly memo: string | null;
};

export type ClassificationSplitDecision = {
    readonly kind: 'split';
    readonly lines: readonly ClassificationSplitLine[];
    readonly payeeName?: string;
};

export type ClassificationDecision = ClassificationCategoryDecision | ClassificationSplitDecision;

const EXCLUDED_GROUP = 'internal master category';

/**
 * Parses a request DTO into a stored classification decision. Invalid shapes fail loud.
 */
export function parseClassificationDecision(dto: ClassificationDecisionDto): ClassificationDecision {
    if (!dto.transactionId.trim()) {
        throw new QueryValidationError('transactionId is required');
    }
    const payeeName = optionalPayeeName(dto.payeeName);
    if (dto.kind === 'category') {
        const categoryId = dto.categoryId?.trim();
        if (!categoryId) {
            throw new QueryValidationError('categoryId is required for category decisions');
        }
        if (dto.lines && dto.lines.length > 0) {
            throw new QueryValidationError('category decisions cannot include split lines');
        }
        return payeeName ? { kind: 'category', categoryId, payeeName } : { kind: 'category', categoryId };
    }
    if (dto.kind === 'split') {
        if (dto.categoryId) {
            throw new QueryValidationError('split decisions cannot include a parent categoryId');
        }
        const lines = parseSplitLines(dto.lines);
        return payeeName ? { kind: 'split', lines, payeeName } : { kind: 'split', lines };
    }
    throw new QueryValidationError("kind must be 'category' or 'split'");
}

/**
 * Validates category ids against the assignable catalog and split milliunit totals.
 */
export function validateClassificationDecision(
    decision: ClassificationDecision,
    transactionAmount: number,
    assignableCategoryIds: ReadonlySet<string>,
): void {
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

export function isExcludedCategoryGroup(groupName: string): boolean {
    return groupName.toLowerCase() === EXCLUDED_GROUP;
}

export function isExcludedCategoryName(name: string): boolean {
    const lower = name.toLowerCase();
    return lower === 'uncategorized' || lower.startsWith('inflow:');
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
