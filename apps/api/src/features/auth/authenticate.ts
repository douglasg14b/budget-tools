import type { AuthUser } from './data/authRepo';
import { findPasswordHash, findUserByUsername } from './data/authRepo';
import { hashPassword, verifyPassword } from './password';

/**
 * An argon2id hash of a throwaway value, verified against when the username does not exist so an
 * unknown user costs the same wall-clock time as a wrong password. Without this, response timing
 * discloses which usernames are provisioned. Computed once, lazily, on first miss.
 */
let dummyHash: string | undefined;

async function getDummyHash(): Promise<string> {
    if (!dummyHash) {
        dummyHash = await hashPassword('not-a-real-password-timing-equaliser');
    }
    return dummyHash;
}

/**
 * Verifies a username/password pair. Returns undefined for both "no such user" and "wrong
 * password" — the caller must not distinguish them to the client either.
 */
export async function authenticateUser(username: string, password: string): Promise<AuthUser | undefined> {
    const storedHash = await findPasswordHash(username);

    if (!storedHash) {
        await verifyPassword(await getDummyHash(), password);
        return undefined;
    }

    if (!(await verifyPassword(storedHash, password))) {
        return undefined;
    }

    return await findUserByUsername(username);
}
