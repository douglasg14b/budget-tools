import type {
    CategorizationProposalDto,
    ReceiptSplitDraftCategoryDto,
    ReceiptSplitDraftLineDto,
} from '@budget-tools/web-sdk';

export type SplitLine = {
    readonly amount: number;
    readonly categoryId: string;
    readonly categoryName: string;
    readonly categoryGroup: string;
    readonly memo: string | null;
};

export function splitLinesTotal(lines: readonly SplitLine[]): number {
    return lines.reduce((sum, line) => sum + line.amount, 0);
}

export function splitLinesSumTo(lines: readonly SplitLine[], transactionAmount: number): boolean {
    return lines.length > 0 && splitLinesTotal(lines) === transactionAmount;
}

export function collapsedSplitCategory(lines: readonly SplitLine[]): SplitLine | null {
    const first = lines[0];
    if (!first?.categoryId || lines.length === 0) {
        return null;
    }
    const same = lines.every(
        (line) => line.categoryId === first.categoryId && line.categoryName === first.categoryName,
    );
    return same ? first : null;
}

export function isCollapsedSplit(lines: readonly SplitLine[]): boolean {
    return collapsedSplitCategory(lines) !== null;
}

export function splitRemainder(lines: readonly SplitLine[], transactionAmount: number): number {
    return transactionAmount - splitLinesTotal(lines);
}

export function validateSplitLines(
    lines: readonly SplitLine[],
    transactionAmount: number,
    assignableIds: ReadonlySet<string>,
): string | null {
    if (lines.length === 0) {
        return 'Add at least one split line';
    }
    for (const line of lines) {
        if (!line.categoryId || !assignableIds.has(line.categoryId)) {
            return 'Every split line needs a category from the pick list';
        }
    }
    if (!splitLinesSumTo(lines, transactionAmount)) {
        return 'Split amounts must sum to the transaction amount';
    }
    return null;
}

export function seedSingleSplitLine(amount: number, line?: Partial<SplitLine>): SplitLine[] {
    return [
        {
            amount,
            categoryId: line?.categoryId ?? '',
            categoryName: line?.categoryName ?? '',
            categoryGroup: line?.categoryGroup ?? '',
            memo: line?.memo ?? null,
        },
    ];
}

export function splitLinesFromReceiptDraft(
    lines: readonly ReceiptSplitDraftLineDto[],
    proposal?: CategorizationProposalDto | null,
): SplitLine[] {
    const prePicked = new Set(lines.flatMap((line) => (line.category ? [line.category.id] : [])));
    // A pre-picked line (the reimbursable share) leaves one remainder: it takes the card's own
    // suggestion. Item-name drafts stay blank for the reviewer, as before.
    const remainder = prePicked.size > 0 ? remainderCategory(proposal, prePicked) : null;
    return lines.map((line) => {
        const category = line.category ?? remainder;
        return {
            amount: line.amountMilliunits,
            categoryId: category?.id ?? '',
            categoryName: category?.name ?? '',
            categoryGroup: category?.groupName ?? '',
            memo: line.memo,
        };
    });
}

/** The highest-ranked suggestion that is not already a pre-picked line (e.g. work travel's Transient). */
function remainderCategory(
    proposal: CategorizationProposalDto | null | undefined,
    exclude: ReadonlySet<string>,
): ReceiptSplitDraftCategoryDto | null {
    if (!proposal) {
        return null;
    }
    const ranked = [
        {
            id: proposal.suggestedCategoryId,
            name: proposal.suggestedCategory,
            groupName: proposal.suggestedCategoryGroup,
        },
        ...proposal.options.map((option) => ({
            id: option.categoryId,
            name: option.category,
            groupName: option.categoryGroup,
        })),
    ];
    for (const candidate of ranked) {
        if (candidate.id && candidate.name && !exclude.has(candidate.id)) {
            return { id: candidate.id, name: candidate.name, groupName: candidate.groupName ?? '' };
        }
    }
    return null;
}
