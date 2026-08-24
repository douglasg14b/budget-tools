export type SimilarFinalizedTransaction = {
    readonly id: string;
    readonly date: string;
    readonly amount: number;
    readonly accountId: string;
    readonly payeeId: string | null;
    readonly payeeName: string | null;
    readonly importPayeeNameOriginal: string | null;
    readonly memo: string | null;
    readonly categoryName: string;
    readonly categoryGroup: string;
};

export type SimilarMatchReason = 'payeeId' | 'importOriginal' | 'payeeName' | 'fuzzyName';

export type RankedSimilarTransaction = SimilarFinalizedTransaction & {
    readonly reason: SimilarMatchReason;
};

export type CurrentTransactionIdentity = {
    readonly id: string;
    readonly payeeId: string | null;
    readonly payeeName: string | null;
    readonly importPayeeNameOriginal: string | null;
    readonly accountId: string;
    readonly amount: number;
};

export const SIMILAR_TRANSACTION_CAP = 8;
export const FUZZY_MIN_SIMILARITY = 0.6;

function normalized(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed.toLowerCase() : null;
}

function sameText(left: string | null | undefined, right: string | null | undefined): boolean {
    const normalizedLeft = normalized(left);
    const normalizedRight = normalized(right);
    return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

/**
 * Picks up to `cap` similar finalized rows: payee id, then import string, then payee name,
 * then fuzzy name fill. Exact matches always beat fuzzy, newest first within a reason.
 */
export function pickSimilarTransactions(input: {
    readonly current: CurrentTransactionIdentity;
    readonly exactCandidates: readonly SimilarFinalizedTransaction[];
    readonly fuzzyCandidates: readonly SimilarFinalizedTransaction[];
    readonly nameSimilarity: (left: string, right: string) => number;
    readonly cap?: number;
}): RankedSimilarTransaction[] {
    const cap = input.cap ?? SIMILAR_TRANSACTION_CAP;
    const selected: RankedSimilarTransaction[] = [];
    const seen = new Set<string>([input.current.id]);

    function take(rows: readonly SimilarFinalizedTransaction[], reason: SimilarMatchReason): void {
        for (const row of rows) {
            if (selected.length >= cap) {
                return;
            }
            if (seen.has(row.id)) {
                continue;
            }
            seen.add(row.id);
            selected.push({ ...row, reason });
        }
    }

    const byPayeeId = input.current.payeeId
        ? input.exactCandidates.filter((row) => row.payeeId === input.current.payeeId)
        : [];
    take(byPayeeId, 'payeeId');

    if (selected.length < cap && input.current.importPayeeNameOriginal?.trim()) {
        take(
            input.exactCandidates.filter((row) =>
                sameText(row.importPayeeNameOriginal, input.current.importPayeeNameOriginal),
            ),
            'importOriginal',
        );
    }

    if (selected.length < cap && input.current.payeeName?.trim()) {
        take(
            input.exactCandidates.filter((row) => sameText(row.payeeName, input.current.payeeName)),
            'payeeName',
        );
    }

    if (selected.length < cap) {
        const currentNames = [input.current.payeeName, input.current.importPayeeNameOriginal].flatMap((value) =>
            value?.trim() ? [value.trim()] : [],
        );

        const ranked = input.fuzzyCandidates
            .map((row) => {
                const rowNames = [row.payeeName, row.importPayeeNameOriginal].flatMap((value) =>
                    value?.trim() ? [value.trim()] : [],
                );
                let best = 0;
                for (const currentName of currentNames) {
                    for (const rowName of rowNames) {
                        best = Math.max(best, input.nameSimilarity(currentName, rowName));
                    }
                }
                return { row, score: best };
            })
            .filter((entry) => entry.score >= FUZZY_MIN_SIMILARITY)
            .sort((left, right) => right.score - left.score || right.row.date.localeCompare(left.row.date));

        take(
            ranked.map((entry) => entry.row),
            'fuzzyName',
        );
    }

    return selected;
}
