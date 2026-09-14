import { describe, expect, it } from 'vitest';

import type { AuthStallState } from '../authStallDiagnosis';
import { diagnoseAuthStall } from '../authStallDiagnosis';

const BASE: AuthStallState = {
    status: 'pending',
    fetchStatus: 'fetching',
    failureCount: 0,
    errorMessage: null,
    startedCount: 1,
};

describe('diagnoseAuthStall', () => {
    it('blames the server when a request is still in flight', () => {
        const diagnosis = diagnoseAuthStall(BASE);
        expect(diagnosis.summary).toBe('The server is taking longer than expected to respond.');
        expect(diagnosis.detail).toContain('still waiting');
    });

    it('reports being offline when the fetch is paused', () => {
        const diagnosis = diagnoseAuthStall({ ...BASE, fetchStatus: 'paused' });
        expect(diagnosis.summary).toBe('You appear to be offline.');
    });

    it('surfaces the server message when the query errored', () => {
        const diagnosis = diagnoseAuthStall({
            ...BASE,
            status: 'error',
            fetchStatus: 'idle',
            failureCount: 1,
            errorMessage: 'Internal Server Error',
        });
        expect(diagnosis.summary).toBe('Could not reach the server to check whether you are signed in.');
        expect(diagnosis.detail).toContain('Internal Server Error');
    });

    it('still explains an error that carried no message', () => {
        const diagnosis = diagnoseAuthStall({ ...BASE, status: 'error', fetchStatus: 'idle', failureCount: 1 });
        expect(diagnosis.detail).toContain('without reporting a reason');
    });

    it('identifies a cancelled request as an app bug', () => {
        // Pending forever, nothing in flight, nothing ever failed: the single attempt made was
        // abandoned before it could settle.
        const diagnosis = diagnoseAuthStall({ ...BASE, fetchStatus: 'idle' });
        expect(diagnosis.summary).toBe('The sign-in check stopped without finishing.');
        expect(diagnosis.detail).toContain('cancelled');
        expect(diagnosis.detail).toContain('a bug in the app');
    });

    it('identifies a cancel-and-restart loop even while a fetch is in flight', () => {
        // The shape of the real outage: `clear()` cancelled the in-flight query, a replacement
        // immediately started fetching, and so `fetchStatus` reads 'fetching' even though nothing
        // will ever settle. Only the repeated starts distinguish this from a slow server.
        const diagnosis = diagnoseAuthStall({ ...BASE, startedCount: 3 });
        expect(diagnosis.summary).toBe('The sign-in check keeps restarting without finishing.');
        expect(diagnosis.detail).toContain('3 times');
        expect(diagnosis.detail).toContain('a bug in the app');
    });

    it('still blames the server when a single slow fetch is outstanding', () => {
        // One start that has not finished is a slow server, not a bug — do not cry wolf.
        expect(diagnoseAuthStall({ ...BASE, startedCount: 1 }).summary).toBe(
            'The server is taking longer than expected to respond.',
        );
    });

    it('includes the raw query state so a report is actionable', () => {
        const diagnosis = diagnoseAuthStall({ ...BASE, fetchStatus: 'idle', failureCount: 3 });
        expect(diagnosis.detail).toContain('status: pending');
        expect(diagnosis.detail).toContain('fetchStatus: idle');
        expect(diagnosis.detail).toContain('failures: 3');
    });
});
