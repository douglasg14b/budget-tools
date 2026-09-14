import { describe, expect, it } from 'vitest';

import { changePasswordComplaint } from '../changePasswordRules';
import { MINIMUM_PASSWORD_LENGTH } from '../password';

const CURRENT = 'current password here';
const ACCEPTABLE = 'a brand new password';

describe('changePasswordComplaint', () => {
    it('accepts a long, different new password', () => {
        expect(changePasswordComplaint(CURRENT, ACCEPTABLE)).toBeUndefined();
    });

    it('requires the current password', () => {
        expect(changePasswordComplaint('', ACCEPTABLE)).toMatch(/current password/i);
    });

    it('requires a new password', () => {
        expect(changePasswordComplaint(CURRENT, '')).toMatch(/new password/i);
    });

    it('enforces the minimum length on the new password', () => {
        const tooShort = 'a'.repeat(MINIMUM_PASSWORD_LENGTH - 1);
        expect(changePasswordComplaint(CURRENT, tooShort)).toMatch(/at least/i);
    });

    it('accepts a new password exactly at the minimum length', () => {
        expect(changePasswordComplaint(CURRENT, 'a'.repeat(MINIMUM_PASSWORD_LENGTH))).toBeUndefined();
    });

    it('rejects reusing the current password', () => {
        expect(changePasswordComplaint(CURRENT, CURRENT)).toMatch(/different/i);
    });

    it('treats a case-different password as a genuine change', () => {
        expect(changePasswordComplaint(CURRENT, CURRENT.toUpperCase())).toBeUndefined();
    });

    it('complains about the missing current password before judging the new one', () => {
        // Otherwise an empty form leads with a length complaint about a field the user has not
        // reached yet.
        expect(changePasswordComplaint('', '')).toMatch(/current password/i);
    });
});
