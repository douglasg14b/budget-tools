import { describe, expect, it } from 'vitest';
import type { SimilarFinalizedTransaction } from '../pickSimilarTransactions';
import { pickSimilarTransactions } from '../pickSimilarTransactions';

describe('pickSimilarTransactions', () => {
    const current = {
        id: 'pending',
        payeeId: 'payee-1',
        payeeName: 'Netflix',
        importPayeeNameOriginal: 'NETFLIX.COM',
        accountId: 'acct-1',
        amount: -14990,
    };

    it('prefers payee id over import string and payee name', () => {
        const selected = pickSimilarTransactions({
            current,
            exactCandidates: [
                similar({
                    id: 'import-hit',
                    date: '2026-07-01',
                    payeeId: 'other',
                    payeeName: 'Other',
                    importPayeeNameOriginal: 'NETFLIX.COM',
                }),
                similar({ id: 'id-hit', date: '2026-06-01', payeeId: 'payee-1' }),
                similar({
                    id: 'name-hit',
                    date: '2026-08-01',
                    payeeId: 'other',
                    payeeName: 'Netflix',
                    importPayeeNameOriginal: 'OTHER',
                }),
            ],
            fuzzyCandidates: [],
            nameSimilarity: () => 0,
        });

        expect(selected.map((row) => row.id)).toEqual(['id-hit', 'import-hit', 'name-hit']);
        expect(selected.map((row) => row.reason)).toEqual(['payeeId', 'importOriginal', 'payeeName']);
    });

    it('excludes the current transaction and unlabeled-style duplicates by id', () => {
        const selected = pickSimilarTransactions({
            current,
            exactCandidates: [
                similar({ id: 'pending', payeeId: 'payee-1' }),
                similar({ id: 'keep', payeeId: 'payee-1' }),
            ],
            fuzzyCandidates: [],
            nameSimilarity: () => 0,
        });

        expect(selected.map((row) => row.id)).toEqual(['keep']);
    });

    it('caps at eight and fills with fuzzy names only when exact matches are thin', () => {
        const exact = Array.from({ length: 2 }, (_, index) =>
            similar({ id: `exact-${index}`, date: `2026-01-0${index + 1}`, payeeId: 'payee-1' }),
        );
        const fuzzy = [
            similar({ id: 'fuzzy-good', payeeName: 'Netflx', payeeId: 'other' }),
            similar({ id: 'fuzzy-noise', payeeName: 'Safeway', payeeId: 'other' }),
        ];

        const selected = pickSimilarTransactions({
            current,
            exactCandidates: exact,
            fuzzyCandidates: fuzzy,
            nameSimilarity: (left, right) => (left.includes('Net') && right.includes('Net') ? 0.9 : 0.1),
            cap: 8,
        });

        expect(selected).toHaveLength(3);
        expect(selected[2]).toMatchObject({ id: 'fuzzy-good', reason: 'fuzzyName' });
    });
});

function similar(overrides: Partial<SimilarFinalizedTransaction> & { id: string }): SimilarFinalizedTransaction {
    return {
        date: '2026-07-01',
        amount: -14990,
        accountId: 'acct-1',
        payeeId: null,
        payeeName: 'Netflix',
        importPayeeNameOriginal: 'NETFLIX.COM',
        memo: null,
        categoryName: 'Streaming',
        categoryGroup: 'Monthly Bills',
        ...overrides,
    };
}
