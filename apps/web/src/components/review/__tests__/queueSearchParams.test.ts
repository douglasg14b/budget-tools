import { describe, expect, it } from 'vitest';

import {
    parseQueueSearchParams,
    queueFiltersActive,
    serializeQueueSearchParams,
    toggleTierFilter,
} from '../queueSearchParams';

describe('parseQueueSearchParams', () => {
    it('defaults to all tiers and no account', () => {
        expect(parseQueueSearchParams(new URLSearchParams())).toEqual({
            tiers: undefined,
            accountId: undefined,
            transactionId: undefined,
            q: undefined,
        });
    });

    it('parses a comma-separated tier list', () => {
        expect(parseQueueSearchParams(new URLSearchParams('tier=Review, Blocked')).tiers).toEqual([
            'Review',
            'Blocked',
        ]);
    });

    it('ignores unknown tier tokens', () => {
        expect(parseQueueSearchParams(new URLSearchParams('tier=Nope')).tiers).toBeUndefined();
        expect(parseQueueSearchParams(new URLSearchParams('tier=Nope,Blocked')).tiers).toEqual(['Blocked']);
    });

    it('parses accountId', () => {
        expect(parseQueueSearchParams(new URLSearchParams('accountId=acct-1'))).toEqual({
            tiers: undefined,
            accountId: 'acct-1',
            transactionId: undefined,
            q: undefined,
        });
    });

    it('parses transactionId', () => {
        expect(parseQueueSearchParams(new URLSearchParams('transactionId=tx-9'))).toEqual({
            tiers: undefined,
            accountId: undefined,
            transactionId: 'tx-9',
            q: undefined,
        });
    });

    it('ignores unknown search params', () => {
        expect(parseQueueSearchParams(new URLSearchParams('llm=true'))).toEqual({
            tiers: undefined,
            accountId: undefined,
            transactionId: undefined,
            q: undefined,
        });
    });

    it('parses q', () => {
        expect(parseQueueSearchParams(new URLSearchParams('q=starbucks'))).toEqual({
            tiers: undefined,
            accountId: undefined,
            transactionId: undefined,
            q: 'starbucks',
        });
    });
});

describe('serializeQueueSearchParams', () => {
    it('round-trips a filtered state', () => {
        const state = {
            tiers: ['Blocked'] as const,
            accountId: 'acct-1',
            transactionId: undefined,
            q: undefined,
        };
        const serialized = serializeQueueSearchParams({ ...state, tiers: [...state.tiers] });
        expect(parseQueueSearchParams(serialized)).toEqual({
            tiers: ['Blocked'],
            accountId: 'acct-1',
            transactionId: undefined,
            q: undefined,
        });
    });

    it('preserves transactionId with filters', () => {
        const serialized = serializeQueueSearchParams({
            tiers: ['Review'],
            accountId: 'acct-1',
            transactionId: 'tx-9',
            q: 'starbucks',
        });
        expect(parseQueueSearchParams(serialized)).toEqual({
            tiers: ['Review'],
            accountId: 'acct-1',
            transactionId: 'tx-9',
            q: 'starbucks',
        });
    });

    it('omits default values', () => {
        const serialized = serializeQueueSearchParams({
            tiers: undefined,
            accountId: undefined,
            transactionId: undefined,
            q: undefined,
        });
        expect(serialized.toString()).toBe('');
    });
});

describe('toggleTierFilter', () => {
    it('filters to the clicked tier when all are visible', () => {
        expect(toggleTierFilter(undefined, 'Blocked')).toEqual(['Blocked']);
    });

    it('clears the filter when the only selected tier is clicked again', () => {
        expect(toggleTierFilter(['Blocked'], 'Blocked')).toBeUndefined();
    });

    it('adds a second tier', () => {
        expect(toggleTierFilter(['Blocked'], 'Review')).toEqual(['Review', 'Blocked']);
    });

    it('returns undefined when all four tiers would be selected', () => {
        expect(toggleTierFilter(['AutoApply', 'Suggested', 'Review'], 'Blocked')).toBeUndefined();
    });
});

describe('queueFiltersActive', () => {
    it('is true when a text query is set', () => {
        expect(queueFiltersActive({ tiers: undefined, accountId: undefined, q: 'store' })).toBe(true);
        expect(queueFiltersActive({ tiers: undefined, accountId: undefined, q: undefined })).toBe(false);
    });
});
