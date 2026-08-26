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
