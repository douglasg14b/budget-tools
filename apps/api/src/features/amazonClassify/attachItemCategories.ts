import type { AmazonItemRecord } from '../amazonOrders/data/amazonOrdersRepo';
import type { AmazonSplitItemDto } from './amazonClassifyDtos';
import type { AmazonSplitRawLine } from './parseAmazonSplitCompletion';

export type AmazonMatchedItem = AmazonItemRecord & {
    readonly orderId: string;
};

/**
 * Attach each Amazon item to the LLM split line for that itemIndex, then memo title match.
 */
export function attachItemCategories(
    items: readonly AmazonMatchedItem[],
    rawLines: readonly AmazonSplitRawLine[],
): AmazonSplitItemDto[] {
    const used = new Set<number>();
    return items.map((item, itemIndex) => {
        const index = findLineIndex(rawLines, used, itemIndex, item.title);
        if (index >= 0) {
            used.add(index);
        }
        const line = index >= 0 ? rawLines[index] : undefined;
        return {
            orderId: item.orderId,
            title: item.title,
            asin: item.asin,
            quantity: item.quantity,
            amount: item.itemTotalMilliunits,
            categoryId: line?.categoryId ?? null,
            categoryName: line?.categoryName ?? null,
            categoryGroup: line?.categoryGroup ?? null,
        };
    });
}

function findLineIndex(
    rawLines: readonly AmazonSplitRawLine[],
    used: ReadonlySet<number>,
    itemIndex: number,
    title: string,
): number {
    const byIndex = rawLines.findIndex((line, lineIndex) => !used.has(lineIndex) && line.itemIndex === itemIndex);
    if (byIndex >= 0) {
        return byIndex;
    }
    return rawLines.findIndex((line, lineIndex) => !used.has(lineIndex) && memoMatchesTitle(line.memo, title));
}

function memoMatchesTitle(memo: string | null, title: string): boolean {
    if (!memo) {
        return false;
    }
    const foldedMemo = fold(memo);
    const foldedTitle = fold(title);
    return foldedMemo === foldedTitle || foldedMemo.includes(foldedTitle) || foldedTitle.includes(foldedMemo);
}

function fold(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
}
