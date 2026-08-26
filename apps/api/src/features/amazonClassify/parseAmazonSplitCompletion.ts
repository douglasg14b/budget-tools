import { LlmSuggestError } from '../categorization/llm/LlmSuggestError';
import type { AssignableCategory } from '../categorization/llm/nearbyCategories';
import { resolveAssignableCategory } from '../categorization/llm/nearbyCategories';
import type { SplitLine } from '../splits/splitLines';
import { collapsedSplitCategory, splitLinesTotal } from '../splits/splitLines';
import { shortenSplitMemo } from './shortenSplitMemo';

export const AMAZON_SPLIT_SCHEMA = {
    type: 'object',
    properties: {
        lines: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    categoryName: { type: 'string' },
                    categoryGroupName: { type: 'string' },
                    amountMilliunits: { type: 'integer' },
                    memo: { type: ['string', 'null'] },
                    itemIndex: { type: ['integer', 'null'] },
                },
                required: ['categoryName', 'categoryGroupName', 'amountMilliunits', 'memo', 'itemIndex'],
                additionalProperties: false,
            },
        },
        rationale: { type: 'string' },
    },
    required: ['lines', 'rationale'],
    additionalProperties: false,
} as const;

export type AmazonSplitRawLine = SplitLine & {
    readonly itemIndex: number | null;
};

export type ParsedAmazonSplit = {
    readonly lines: SplitLine[];
    readonly rawLines: AmazonSplitRawLine[];
    readonly rationale: string | null;
};

export function parseAmazonSplitCompletion(
    content: string,
    catalog: readonly AssignableCategory[],
    transactionAmount: number,
    itemCount = Number.POSITIVE_INFINITY,
): ParsedAmazonSplit {
    let parsed: unknown;
    try {
        parsed = JSON.parse(content) as unknown;
    } catch (error) {
        throw new LlmSuggestError(503, 'Amazon split completion was not valid JSON', { cause: error });
    }
    if (!parsed || typeof parsed !== 'object') {
        throw new LlmSuggestError(503, 'Amazon split completion was not an object');
    }
    const record = parsed as Record<string, unknown>;
    if (!Array.isArray(record.lines) || record.lines.length === 0) {
        throw new LlmSuggestError(503, 'Amazon split completion had no lines');
    }

    const rawLines: AmazonSplitRawLine[] = [];
    for (const entry of record.lines) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }
        const row = entry as Record<string, unknown>;
        const categoryName = typeof row.categoryName === 'string' ? row.categoryName : '';
        const categoryGroupName = typeof row.categoryGroupName === 'string' ? row.categoryGroupName : null;
        const assigned = resolveAssignableCategory(catalog, categoryName, categoryGroupName);
        if (!assigned) {
            const label = categoryGroupName ? `${categoryName} (${categoryGroupName})` : categoryName;
            throw new LlmSuggestError(503, `Amazon split used an unknown category: ${label}`);
        }
        let amount =
            typeof row.amountMilliunits === 'number' && Number.isFinite(row.amountMilliunits)
                ? Math.round(row.amountMilliunits)
                : null;
        if (amount == null) {
            throw new LlmSuggestError(503, 'Amazon split line was missing amountMilliunits');
        }
        if (transactionAmount !== 0 && amount !== 0 && Math.sign(amount) !== Math.sign(transactionAmount)) {
            amount = -amount;
        }
        const itemIndexRaw = row.itemIndex;
        const itemIndex =
            typeof itemIndexRaw === 'number' &&
            Number.isInteger(itemIndexRaw) &&
            itemIndexRaw >= 0 &&
            itemIndexRaw < itemCount
                ? itemIndexRaw
                : null;
        rawLines.push({
            amount,
            categoryId: assigned.id,
            categoryName: assigned.name,
            categoryGroup: assigned.groupName,
            memo: shortenSplitMemo(typeof row.memo === 'string' ? row.memo : null),
            itemIndex,
        });
    }

    if (rawLines.length === 0) {
        throw new LlmSuggestError(503, 'Amazon split completion had no usable lines');
    }

    const rationale = typeof record.rationale === 'string' && record.rationale.trim() ? record.rationale.trim() : null;
    return {
        lines: collapseAndBalance(rawLines.map(toSplitLine), transactionAmount),
        rawLines,
        rationale,
    };
}

function toSplitLine(line: AmazonSplitRawLine): SplitLine {
    return {
        amount: line.amount,
        categoryId: line.categoryId,
        categoryName: line.categoryName,
        categoryGroup: line.categoryGroup,
        memo: line.memo,
    };
}

export function collapseAndBalance(lines: readonly SplitLine[], transactionAmount: number): SplitLine[] {
    const collapsed = collapsedSplitCategory(lines);
    const next = collapsed
        ? [
              {
                  ...collapsed,
                  amount: splitLinesTotal(lines),
                  memo: lines.length === 1 ? collapsed.memo : null,
              },
          ]
        : [...lines];
    const last = next.at(-1);
    if (!last) {
        return next;
    }
    const diff = transactionAmount - splitLinesTotal(next);
    if (diff === 0) {
        return next;
    }
    return [...next.slice(0, -1), { ...last, amount: last.amount + diff }];
}
