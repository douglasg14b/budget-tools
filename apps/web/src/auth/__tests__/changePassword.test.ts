import { describe, expect, it } from 'vitest';

import { changePasswordErrorMessage, changePasswordSuccessMessage, validateChangePassword } from '../changePassword';

const VALID = {
    currentPassword: 'old-password-1',
    newPassword: 'brand-new-password',
    confirmPassword: 'brand-new-password',
};

describe('validateChangePassword', () => {
    it('accepts a filled, matching, long-enough, changed password', () => {
        expect(validateChangePassword(VALID)).toBeNull();
    });

    it('rejects a missing field', () => {
        const expected = 'Fill in every field to change your password.';
        expect(validateChangePassword({ ...VALID, currentPassword: '' })).toBe(expected);
        expect(validateChangePassword({ ...VALID, newPassword: '' })).toBe(expected);
        expect(validateChangePassword({ ...VALID, confirmPassword: '' })).toBe(expected);
    });

    it('rejects a mistyped confirmation', () => {
        expect(validateChangePassword({ ...VALID, confirmPassword: 'brand-new-passwerd' })).toBe(
            'The new passwords do not match.',
        );
    });

    it('reports the mismatch before the length rule', () => {
        // Both are too short, but the mismatch is the error the user can see and fix.
        expect(validateChangePassword({ ...VALID, newPassword: 'short', confirmPassword: 'shorter' })).toBe(
            'The new passwords do not match.',
        );
    });

    it('enforces the 12-character minimum', () => {
        const elevenChars = 'abcdefghijk';
        expect(elevenChars).toHaveLength(11);
        expect(validateChangePassword({ ...VALID, newPassword: elevenChars, confirmPassword: elevenChars })).toBe(
            'Your new password must be at least 12 characters.',
        );
    });

    it('accepts exactly 12 characters', () => {
        const twelveChars = 'abcdefghijkl';
        expect(twelveChars).toHaveLength(12);
        expect(validateChangePassword({ ...VALID, newPassword: twelveChars, confirmPassword: twelveChars })).toBeNull();
    });

    it('rejects a new password identical to the current one', () => {
        expect(
            validateChangePassword({
                currentPassword: 'brand-new-password',
                newPassword: 'brand-new-password',
                confirmPassword: 'brand-new-password',
            }),
        ).toBe('Your new password must be different from your current password.');
    });
});

describe('changePasswordErrorMessage', () => {
    it('surfaces the server message from a 403 wrong current password', () => {
        expect(changePasswordErrorMessage({ status: 403, message: 'Your current password is incorrect.' })).toBe(
            'Your current password is incorrect.',
        );
    });

    it('replaces a bare framework "Forbidden" with plain-language copy', () => {
        expect(changePasswordErrorMessage({ status: 403, message: 'Forbidden' })).toBe(
            'Your current password is incorrect.',
        );
    });

    it('surfaces validation text from a 400', () => {
        expect(changePasswordErrorMessage({ status: 400, message: 'newPassword must be at least 12 characters' })).toBe(
            'newPassword must be at least 12 characters',
        );
    });

    it('reports an unreachable server distinctly', () => {
        expect(changePasswordErrorMessage(new TypeError('Failed to fetch'))).toBe(
            'Could not reach the server. Check your connection and try again.',
        );
    });

    it('falls back for unknown shapes and empty errors', () => {
        expect(changePasswordErrorMessage({ status: 500 })).toBe('Could not change your password. Please try again.');
        expect(changePasswordErrorMessage(null)).toBe('Could not change your password. Please try again.');
        expect(changePasswordErrorMessage({})).toBe('Could not change your password. Please try again.');
        expect(changePasswordErrorMessage({ status: 403, message: '   ' })).toBe(
            'Could not change your password. Please try again.',
        );
    });
});

describe('changePasswordSuccessMessage', () => {
    it('says nothing about sessions when none were revoked', () => {
        expect(changePasswordSuccessMessage(0)).toBe('Your password has been changed.');
    });

    it('uses the singular for exactly one other session', () => {
        expect(changePasswordSuccessMessage(1)).toBe('Your password has been changed. 1 other session signed out.');
    });

    it('uses the plural beyond one', () => {
        expect(changePasswordSuccessMessage(3)).toBe('Your password has been changed. 3 other sessions signed out.');
    });

    it('treats a nonsensical negative count as no revocations', () => {
        expect(changePasswordSuccessMessage(-1)).toBe('Your password has been changed.');
    });
});
