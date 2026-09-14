import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AppDatabaseClient } from '../../../../data-persistence/database';
import { createTestAppDatabase } from '../../../../data-persistence/testDatabase';
import { verifyPassword } from '../../password';
import { createSessionToken, hashSessionToken, SESSION_DURATION_MS } from '../../sessionToken';
import {
    createSession,
    deleteExpiredSessions,
    deleteOtherSessionsForUser,
    deleteSession,
    deleteSessionsForUser,
    findPasswordHash,
    findPasswordHashById,
    findSessionByToken,
    findUserByUsername,
    listUsernames,
    refreshSession,
    updatePassword,
    upsertUser,
} from '../authRepo';

const PASSWORD = 'correct horse battery staple';

describe('authRepo', () => {
    let appDb: Awaited<ReturnType<typeof createTestAppDatabase>>;
    let database: AppDatabaseClient;

    beforeEach(async () => {
        appDb = await createTestAppDatabase();
        database = appDb.db;
    });

    afterEach(async () => {
        await appDb.close();
    });

    describe('upsertUser', () => {
        it('creates a user whose stored hash verifies but is not the password', async () => {
            const user = await upsertUser('douglas', PASSWORD, database);
            expect(user.username).toBe('douglas');

            const storedHash = await findPasswordHash('douglas', database);
            expect(storedHash).toBeDefined();
            expect(storedHash).not.toContain(PASSWORD);
            expect(await verifyPassword(storedHash!, PASSWORD)).toBe(true);
        });

        it('updates the password in place rather than creating a second row', async () => {
            const created = await upsertUser('douglas', PASSWORD, database);
            const updated = await upsertUser('douglas', 'a different password', database);

            expect(updated.id).toBe(created.id);
            expect(await listUsernames(database)).toEqual(['douglas']);

            const storedHash = await findPasswordHash('douglas', database);
            expect(await verifyPassword(storedHash!, 'a different password')).toBe(true);
            expect(await verifyPassword(storedHash!, PASSWORD)).toBe(false);
        });

        it('matches an existing user case-insensitively instead of colliding', async () => {
            const created = await upsertUser('douglas', PASSWORD, database);
            const updated = await upsertUser('Douglas', 'a different password', database);

            expect(updated.id).toBe(created.id);
            expect(await listUsernames(database)).toHaveLength(1);
        });

        it('signs the user out everywhere when their password changes', async () => {
            const user = await upsertUser('douglas', PASSWORD, database);
            const token = createSessionToken();
            await createSession(user.id, token, new Date(), database);
            expect(await findSessionByToken(token, database)).toBeDefined();

            await upsertUser('douglas', 'a different password', database);
            expect(await findSessionByToken(token, database)).toBeUndefined();
        });
    });

    describe('findUserByUsername', () => {
        it('finds a user regardless of casing', async () => {
            await upsertUser('douglas', PASSWORD, database);
            expect(await findUserByUsername('DOUGLAS', database)).toMatchObject({ username: 'douglas' });
        });

        it('returns undefined for an unknown user', async () => {
            expect(await findUserByUsername('nobody', database)).toBeUndefined();
            expect(await findPasswordHash('nobody', database)).toBeUndefined();
        });
    });

    describe('createSession', () => {
        it('stores only the token hash, never the raw token', async () => {
            const user = await upsertUser('douglas', PASSWORD, database);
            const token = createSessionToken();
            await createSession(user.id, token, new Date(), database);

            const row = await database.selectFrom('sessions').selectAll().executeTakeFirstOrThrow();
            expect(row.tokenHash).toBe(hashSessionToken(token));
            expect(row.tokenHash).not.toBe(token);
        });

        it('expires 90 days out', async () => {
            const user = await upsertUser('douglas', PASSWORD, database);
            const now = new Date('2026-09-13T12:00:00.000Z');
            const { expiresAt } = await createSession(user.id, createSessionToken(), now, database);
            expect(expiresAt.getTime() - now.getTime()).toBe(SESSION_DURATION_MS);
        });
    });

    describe('findSessionByToken', () => {
        it('returns the session with its owning user', async () => {
            const user = await upsertUser('douglas', PASSWORD, database);
            const token = createSessionToken();
            await createSession(user.id, token, new Date(), database);

            const session = await findSessionByToken(token, database);
            expect(session?.user).toMatchObject({ id: user.id, username: 'douglas' });
        });

        it('returns undefined for an unknown or tampered token', async () => {
            const user = await upsertUser('douglas', PASSWORD, database);
            const token = createSessionToken();
            await createSession(user.id, token, new Date(), database);

            expect(await findSessionByToken(createSessionToken(), database)).toBeUndefined();
            expect(await findSessionByToken(`${token}x`, database)).toBeUndefined();
        });

        it('does not leak one user session to another user', async () => {
            const douglas = await upsertUser('douglas', PASSWORD, database);
            const spouse = await upsertUser('spouse', PASSWORD, database);
            const douglasToken = createSessionToken();
            const spouseToken = createSessionToken();
            await createSession(douglas.id, douglasToken, new Date(), database);
            await createSession(spouse.id, spouseToken, new Date(), database);

            expect((await findSessionByToken(douglasToken, database))?.user.username).toBe('douglas');
            expect((await findSessionByToken(spouseToken, database))?.user.username).toBe('spouse');
        });
    });

    describe('refreshSession', () => {
        it('slides the expiry forward from the new now', async () => {
            const user = await upsertUser('douglas', PASSWORD, database);
            const token = createSessionToken();
            const createdAt = new Date('2026-09-13T12:00:00.000Z');
            const { sessionId, expiresAt: original } = await createSession(user.id, token, createdAt, database);

            const later = new Date('2026-10-13T12:00:00.000Z');
            const slid = await refreshSession(sessionId, later, database);

            expect(slid.getTime()).toBeGreaterThan(original.getTime());
            expect(slid.getTime() - later.getTime()).toBe(SESSION_DURATION_MS);

            const session = await findSessionByToken(token, database);
            expect(session?.lastUsedAt.toISOString()).toBe(later.toISOString());
        });
    });

    describe('deleteSession', () => {
        it('makes the token unusable', async () => {
            const user = await upsertUser('douglas', PASSWORD, database);
            const token = createSessionToken();
            const { sessionId } = await createSession(user.id, token, new Date(), database);

            await deleteSession(sessionId, database);
            expect(await findSessionByToken(token, database)).toBeUndefined();
        });

        it('leaves other sessions for the same user alone', async () => {
            const user = await upsertUser('douglas', PASSWORD, database);
            const phone = createSessionToken();
            const laptop = createSessionToken();
            const { sessionId } = await createSession(user.id, phone, new Date(), database);
            await createSession(user.id, laptop, new Date(), database);

            await deleteSession(sessionId, database);
            expect(await findSessionByToken(phone, database)).toBeUndefined();
            expect(await findSessionByToken(laptop, database)).toBeDefined();
        });
    });

    describe('deleteSessionsForUser', () => {
        it('clears every session for that user only', async () => {
            const douglas = await upsertUser('douglas', PASSWORD, database);
            const spouse = await upsertUser('spouse', PASSWORD, database);
            const douglasToken = createSessionToken();
            const spouseToken = createSessionToken();
            await createSession(douglas.id, douglasToken, new Date(), database);
            await createSession(douglas.id, createSessionToken(), new Date(), database);
            await createSession(spouse.id, spouseToken, new Date(), database);

            await deleteSessionsForUser(douglas.id, database);
            expect(await findSessionByToken(douglasToken, database)).toBeUndefined();
            expect(await findSessionByToken(spouseToken, database)).toBeDefined();
        });
    });

    describe('deleteExpiredSessions', () => {
        it('sweeps only sessions past their expiry', async () => {
            const user = await upsertUser('douglas', PASSWORD, database);
            const staleToken = createSessionToken();
            const liveToken = createSessionToken();
            const longAgo = new Date('2020-01-01T00:00:00.000Z');
            await createSession(user.id, staleToken, longAgo, database);
            await createSession(user.id, liveToken, new Date(), database);

            const swept = await deleteExpiredSessions(new Date(), database);
            expect(swept).toBe(1);
            expect(await findSessionByToken(staleToken, database)).toBeUndefined();
            expect(await findSessionByToken(liveToken, database)).toBeDefined();
        });
    });

    describe('findPasswordHashById', () => {
        it('returns the hash for an existing user', async () => {
            const user = await upsertUser('douglas', PASSWORD, database);
            const hash = await findPasswordHashById(user.id, database);
            expect(hash).toBeDefined();
            expect(await verifyPassword(hash!, PASSWORD)).toBe(true);
        });

        it('returns undefined for an unknown id', async () => {
            expect(await findPasswordHashById('00000000-0000-0000-0000-000000000000', database)).toBeUndefined();
        });
    });

    describe('updatePassword', () => {
        it('replaces the hash so only the new password verifies', async () => {
            const user = await upsertUser('douglas', PASSWORD, database);
            await updatePassword(user.id, 'a brand new password', database);

            const hash = await findPasswordHashById(user.id, database);
            expect(await verifyPassword(hash!, 'a brand new password')).toBe(true);
            expect(await verifyPassword(hash!, PASSWORD)).toBe(false);
        });

        it('leaves sessions alone, unlike upsertUser', async () => {
            // The change-password endpoint revokes selectively afterwards; the repo call itself
            // must not pre-empt that decision.
            const user = await upsertUser('douglas', PASSWORD, database);
            const token = createSessionToken();
            await createSession(user.id, token, new Date(), database);

            await updatePassword(user.id, 'a brand new password', database);
            expect(await findSessionByToken(token, database)).toBeDefined();
        });

        it('does not touch another user', async () => {
            const douglas = await upsertUser('douglas', PASSWORD, database);
            await upsertUser('spouse', PASSWORD, database);

            await updatePassword(douglas.id, 'a brand new password', database);

            const spouseHash = await findPasswordHash('spouse', database);
            expect(await verifyPassword(spouseHash!, PASSWORD)).toBe(true);
        });
    });

    describe('deleteOtherSessionsForUser', () => {
        it('keeps the named session and drops the rest', async () => {
            const user = await upsertUser('douglas', PASSWORD, database);
            const keptToken = createSessionToken();
            const phoneToken = createSessionToken();
            const tabletToken = createSessionToken();
            const { sessionId: keptId } = await createSession(user.id, keptToken, new Date(), database);
            await createSession(user.id, phoneToken, new Date(), database);
            await createSession(user.id, tabletToken, new Date(), database);

            const revoked = await deleteOtherSessionsForUser(user.id, keptId, database);

            expect(revoked).toBe(2);
            expect(await findSessionByToken(keptToken, database)).toBeDefined();
            expect(await findSessionByToken(phoneToken, database)).toBeUndefined();
            expect(await findSessionByToken(tabletToken, database)).toBeUndefined();
        });

        it('reports zero when the session is the only one', async () => {
            const user = await upsertUser('douglas', PASSWORD, database);
            const token = createSessionToken();
            const { sessionId } = await createSession(user.id, token, new Date(), database);

            expect(await deleteOtherSessionsForUser(user.id, sessionId, database)).toBe(0);
            expect(await findSessionByToken(token, database)).toBeDefined();
        });

        it('never touches another user’s sessions', async () => {
            const douglas = await upsertUser('douglas', PASSWORD, database);
            const spouse = await upsertUser('spouse', PASSWORD, database);
            const douglasKept = createSessionToken();
            const douglasOther = createSessionToken();
            const spouseToken = createSessionToken();
            const { sessionId: keptId } = await createSession(douglas.id, douglasKept, new Date(), database);
            await createSession(douglas.id, douglasOther, new Date(), database);
            await createSession(spouse.id, spouseToken, new Date(), database);

            const revoked = await deleteOtherSessionsForUser(douglas.id, keptId, database);

            expect(revoked).toBe(1);
            expect(await findSessionByToken(spouseToken, database)).toBeDefined();
        });
    });
});
