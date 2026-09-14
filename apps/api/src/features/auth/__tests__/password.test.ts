import { describe, expect, it } from 'vitest';

import { hashPassword, MINIMUM_PASSWORD_LENGTH, passwordComplaint, verifyPassword } from '../password';

describe('passwordComplaint', () => {
    it('rejects passwords under the minimum length', () => {
        expect(passwordComplaint('a'.repeat(MINIMUM_PASSWORD_LENGTH - 1))).toMatch(/at least/);
    });

    it('accepts passwords at or over the minimum length', () => {
        expect(passwordComplaint('a'.repeat(MINIMUM_PASSWORD_LENGTH))).toBeUndefined();
        expect(passwordComplaint('correct horse battery staple')).toBeUndefined();
    });
});

describe('hashPassword', () => {
    it('produces an argon2id PHC string, not the password', async () => {
        const hash = await hashPassword('correct horse battery staple');
        expect(hash).toMatch(/^\$argon2id\$/);
        expect(hash).not.toContain('correct horse battery staple');
    });

    it('salts, so the same password hashes differently every time', async () => {
        const [first, second] = await Promise.all([hashPassword('same password'), hashPassword('same password')]);
        expect(first).not.toBe(second);
    });
});

describe('verifyPassword', () => {
    it('accepts the correct password', async () => {
        const hash = await hashPassword('correct horse battery staple');
        expect(await verifyPassword(hash, 'correct horse battery staple')).toBe(true);
    });

    it('rejects a wrong password', async () => {
        const hash = await hashPassword('correct horse battery staple');
        expect(await verifyPassword(hash, 'Correct horse battery staple')).toBe(false);
        expect(await verifyPassword(hash, 'wrong')).toBe(false);
        expect(await verifyPassword(hash, '')).toBe(false);
    });

    it('reads a malformed stored hash as a failed login rather than throwing', async () => {
        expect(await verifyPassword('not-a-hash', 'anything')).toBe(false);
        expect(await verifyPassword('', 'anything')).toBe(false);
    });
});
