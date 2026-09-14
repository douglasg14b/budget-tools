import { randomUUID } from 'node:crypto';

import type { AppDatabaseClient } from '../../../data-persistence/database';
import { getAppDatabase } from '../../../data-persistence/database';
import { hashPassword } from '../password';
import { hashSessionToken, sessionExpiryFrom } from '../sessionToken';

export type AuthUser = {
    id: string;
    username: string;
};

export type SessionWithUser = {
    sessionId: string;
    expiresAt: Date;
    lastUsedAt: Date;
    user: AuthUser;
};

/**
 * Creates or updates a user's password. Used only by the offline provisioning CLI — there is no
 * signup endpoint. Usernames are matched case-insensitively, so re-provisioning `Douglas` updates
 * the row created as `douglas` rather than colliding on the unique index.
 */
export async function upsertUser(username: string, password: string, db?: AppDatabaseClient): Promise<AuthUser> {
    const database = db ?? (await getAppDatabase());
    const passwordHash = await hashPassword(password);
    const now = new Date();

    const existing = await findUserByUsername(username, database);
    if (existing) {
        await database
            .updateTable('users')
            .set({ passwordHash, updatedAt: now })
            .where('id', '=', existing.id)
            .execute();
        // A password change must not leave old sessions usable.
        await deleteSessionsForUser(existing.id, database);
        return existing;
    }

    const user = { id: randomUUID(), username };
    await database
        .insertInto('users')
        .values({ ...user, passwordHash, createdAt: now, updatedAt: now })
        .execute();
    return user;
}

export async function listUsernames(db?: AppDatabaseClient): Promise<string[]> {
    const database = db ?? (await getAppDatabase());
    const rows = await database.selectFrom('users').select('username').orderBy('username').execute();
    return rows.map((row) => row.username);
}

export async function findUserByUsername(username: string, db?: AppDatabaseClient): Promise<AuthUser | undefined> {
    const database = db ?? (await getAppDatabase());
    const row = await database
        .selectFrom('users')
        .select(['id', 'username'])
        .where((eb) => eb(eb.fn('lower', ['username']), '=', username.toLowerCase()))
        .executeTakeFirst();
    return row ?? undefined;
}

/** Returns the stored argon2 hash for a username, or undefined when no such user exists. */
export async function findPasswordHash(username: string, db?: AppDatabaseClient): Promise<string | undefined> {
    const database = db ?? (await getAppDatabase());
    const row = await database
        .selectFrom('users')
        .select('passwordHash')
        .where((eb) => eb(eb.fn('lower', ['username']), '=', username.toLowerCase()))
        .executeTakeFirst();
    return row?.passwordHash;
}

/** Returns the stored argon2 hash for a user id, or undefined when no such user exists. */
export async function findPasswordHashById(userId: string, db?: AppDatabaseClient): Promise<string | undefined> {
    const database = db ?? (await getAppDatabase());
    const row = await database.selectFrom('users').select('passwordHash').where('id', '=', userId).executeTakeFirst();
    return row?.passwordHash;
}

/**
 * Replaces a user's password hash. Unlike `upsertUser` this does not touch sessions — the caller
 * decides which to revoke, because a self-service password change keeps the caller signed in
 * while an operator-driven reset does not.
 */
export async function updatePassword(userId: string, password: string, db?: AppDatabaseClient): Promise<void> {
    const database = db ?? (await getAppDatabase());
    const passwordHash = await hashPassword(password);
    await database.updateTable('users').set({ passwordHash, updatedAt: new Date() }).where('id', '=', userId).execute();
}

/**
 * Revokes every session for a user except the one given. Used by the password-change endpoint:
 * anyone who had stolen a session elsewhere is booted, while the tab that made the change stays
 * usable.
 */
export async function deleteOtherSessionsForUser(
    userId: string,
    keepSessionId: string,
    db?: AppDatabaseClient,
): Promise<number> {
    const database = db ?? (await getAppDatabase());
    const result = await database
        .deleteFrom('sessions')
        .where('userId', '=', userId)
        .where('id', '!=', keepSessionId)
        .executeTakeFirst();
    return Number(result.numDeletedRows ?? 0);
}

/** Stores a new session for the given raw token. Only the token's hash is persisted. */
export async function createSession(
    userId: string,
    token: string,
    now: Date,
    db?: AppDatabaseClient,
): Promise<{ sessionId: string; expiresAt: Date }> {
    const database = db ?? (await getAppDatabase());
    const sessionId = randomUUID();
    const expiresAt = sessionExpiryFrom(now);

    await database
        .insertInto('sessions')
        .values({
            id: sessionId,
            userId,
            tokenHash: hashSessionToken(token),
            createdAt: now,
            expiresAt,
            lastUsedAt: now,
        })
        .execute();

    return { sessionId, expiresAt };
}

/**
 * Looks up a live session by raw token, joining the owning user. Returns undefined when the token
 * is unknown; expiry is the caller's decision so it can distinguish "expired" from "never existed"
 * when clearing cookies.
 */
export async function findSessionByToken(token: string, db?: AppDatabaseClient): Promise<SessionWithUser | undefined> {
    const database = db ?? (await getAppDatabase());
    const row = await database
        .selectFrom('sessions')
        .innerJoin('users', 'users.id', 'sessions.userId')
        .select([
            'sessions.id as sessionId',
            'sessions.expiresAt as expiresAt',
            'sessions.lastUsedAt as lastUsedAt',
            'users.id as userId',
            'users.username as username',
        ])
        .where('sessions.tokenHash', '=', hashSessionToken(token))
        .executeTakeFirst();

    if (!row) {
        return undefined;
    }

    return {
        sessionId: row.sessionId,
        expiresAt: row.expiresAt,
        lastUsedAt: row.lastUsedAt,
        user: { id: row.userId, username: row.username },
    };
}

/** Slides a session's expiry forward and records the touch. */
export async function refreshSession(sessionId: string, now: Date, db?: AppDatabaseClient): Promise<Date> {
    const database = db ?? (await getAppDatabase());
    const expiresAt = sessionExpiryFrom(now);
    await database.updateTable('sessions').set({ expiresAt, lastUsedAt: now }).where('id', '=', sessionId).execute();
    return expiresAt;
}

export async function deleteSession(sessionId: string, db?: AppDatabaseClient): Promise<void> {
    const database = db ?? (await getAppDatabase());
    await database.deleteFrom('sessions').where('id', '=', sessionId).execute();
}

export async function deleteSessionsForUser(userId: string, db?: AppDatabaseClient): Promise<void> {
    const database = db ?? (await getAppDatabase());
    await database.deleteFrom('sessions').where('userId', '=', userId).execute();
}

/** Housekeeping: drops rows whose expiry has already passed. Called on API start. */
export async function deleteExpiredSessions(now: Date, db?: AppDatabaseClient): Promise<number> {
    const database = db ?? (await getAppDatabase());
    const result = await database.deleteFrom('sessions').where('expiresAt', '<=', now).executeTakeFirst();
    return Number(result.numDeletedRows ?? 0);
}
