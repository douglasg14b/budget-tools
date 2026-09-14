import argon2 from 'argon2';

/**
 * argon2id parameters. These are the OWASP-recommended second option (46 MiB, 1 iteration,
 * 1 degree of parallelism); argon2's own defaults are close but we pin them so a library default
 * change cannot silently weaken stored hashes. Existing hashes carry their own parameters in the
 * PHC string, so raising these later only affects newly written hashes.
 */
const HASH_OPTIONS = {
    type: argon2.argon2id,
    memoryCost: 47104,
    timeCost: 1,
    parallelism: 1,
} as const;

/** Rejected before hashing: argon2 itself has no meaningful lower bound. */
export const MINIMUM_PASSWORD_LENGTH = 12;

export function passwordComplaint(password: string): string | undefined {
    if (password.length < MINIMUM_PASSWORD_LENGTH) {
        return `Password must be at least ${MINIMUM_PASSWORD_LENGTH} characters.`;
    }
    return undefined;
}

/** Produces a PHC-format argon2id string that embeds its own salt and parameters. */
export async function hashPassword(password: string): Promise<string> {
    return argon2.hash(password, HASH_OPTIONS);
}

/**
 * Verifies a password against a stored hash. Returns false rather than throwing when the stored
 * hash is malformed, so a corrupt row reads as a failed login instead of a 500.
 */
export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
    try {
        return await argon2.verify(storedHash, password);
    } catch {
        return false;
    }
}
