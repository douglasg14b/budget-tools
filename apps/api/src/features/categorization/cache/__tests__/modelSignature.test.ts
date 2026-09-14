import { statSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', () => ({
    statSync: vi.fn(() => ({ size: 100, mtimeMs: 1_700_000_000_000 })),
}));

vi.mock('../../../../environment', () => ({
    getCategorizationScorerUrl: vi.fn(() => undefined),
}));

import { getCategorizationScorerUrl } from '../../../../environment';
import { modelSignature } from '../proposalCache';

const statSyncMock = vi.mocked(statSync);
const scorerUrlMock = vi.mocked(getCategorizationScorerUrl);

describe('modelSignature', () => {
    beforeEach(() => {
        statSyncMock.mockClear();
        scorerUrlMock.mockReset();
        scorerUrlMock.mockReturnValue(undefined);
        vi.unstubAllGlobals();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('fingerprints the local files when no scorer is configured', async () => {
        const signature = await modelSignature('/models');

        expect(signature).toBe(
            'category-model.zip:100:1700000000000|group-model.zip:100:1700000000000|payee-model.zip:100:1700000000000',
        );
        expect(statSyncMock).toHaveBeenCalledTimes(3);
    });

    it('asks the scorer instead of touching the filesystem when one is configured', async () => {
        // The deployment that broke: the API delegates scoring over HTTP and has no model files,
        // so any stat would throw ENOENT and fail every categorization request.
        scorerUrlMock.mockReturnValue('http://scorer:4021');
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response(JSON.stringify({ ready: true, modelSignature: 'sig-from-scorer' }))),
        );

        await expect(modelSignature('/models')).resolves.toBe('sig-from-scorer');
        expect(statSyncMock).not.toHaveBeenCalled();
    });

    it('trims a trailing slash off the scorer url', async () => {
        scorerUrlMock.mockReturnValue('http://scorer:4021/');
        const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
            Promise.resolve(new Response(JSON.stringify({ modelSignature: 'sig' }))),
        );
        vi.stubGlobal('fetch', fetchMock);

        await modelSignature('/models');

        expect(fetchMock).toHaveBeenCalledWith('http://scorer:4021/health', expect.anything());
    });

    it('throws rather than inventing a signature when the scorer is unreachable', async () => {
        // A placeholder signature would let two different model sets share cached proposals.
        scorerUrlMock.mockReturnValue('http://scorer:4021');
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => {
                throw new Error('connect ECONNREFUSED');
            }),
        );

        await expect(modelSignature('/models')).rejects.toThrow(/Could not reach the categorization scorer/);
    });

    it('throws when the scorer answers with an error status', async () => {
        scorerUrlMock.mockReturnValue('http://scorer:4021');
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('nope', { status: 503 })),
        );

        await expect(modelSignature('/models')).rejects.toThrow(/answered 503/);
    });

    it('throws when the scorer omits the signature', async () => {
        scorerUrlMock.mockReturnValue('http://scorer:4021');
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response(JSON.stringify({ ready: true }))),
        );

        await expect(modelSignature('/models')).rejects.toThrow(/returned no model signature/);
    });
});
