export const SPLIT_MEMO_MAX_CHARS = 40;

/**
 * YNAB split memos should name the thing, not paste the Amazon listing title.
 */
export function shortenSplitMemo(memo: string | null): string | null {
    if (!memo) {
        return null;
    }
    const collapsed = memo.trim().replace(/\s+/g, ' ');
    if (!collapsed) {
        return null;
    }
    const practical = dropSizeCatalog(collapsed);
    if (practical.length <= SPLIT_MEMO_MAX_CHARS) {
        return practical;
    }
    const cut = practical.slice(0, SPLIT_MEMO_MAX_CHARS);
    const lastSpace = cut.lastIndexOf(' ');
    const clipped = (lastSpace >= 12 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.-]+$/u, '').trim();
    return clipped || cut.trim();
}

function dropSizeCatalog(value: string): string {
    const withoutParens = value.replace(/\s*\([^)]*(?:\d+\s*(?:["”]|inch(?:es)?|in\.?))[^)]*\)/giu, '').trim();
    const withoutTail = (withoutParens || value)
        .replace(
            /(?:,)?\s+(?:\d+(?:\.\d+)?\s*-?\s*(?:inch(?:es)?|in\.?|")(?:\s*,\s*(?:and\s+)?|\s+and\s+))+\d+(?:\.\d+)?\s*-?\s*(?:inch(?:es)?|in\.?|")\s*$/iu,
            '',
        )
        .replace(/[,\s]+$/u, '')
        .trim();
    return withoutTail || value;
}
