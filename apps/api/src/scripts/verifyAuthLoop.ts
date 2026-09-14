/**
 * End-to-end smoke check of the auth loop against the real Express app and the real Postgres.
 *
 *   pnpm --filter @budget-tools/api verify-auth
 *
 * Boots the app on an ephemeral port, provisions a throwaway user, exercises the login → use →
 * refresh → logout cycle over real HTTP with real cookies, and removes the user afterwards. This
 * is deliberately a script rather than a Vitest file: the repo has no HTTP-level test harness, and
 * this needs a real Postgres rather than the PGlite used by the unit tests.
 */
import { getAppDatabase } from '../data-persistence/database';
import { deleteSessionsForUser, findUserByUsername, upsertUser } from '../features/auth/data/authRepo';
import { app } from '../server';

const PASSWORD = 'verify-auth-loop-password';
const USERNAME = '__verify_auth_probe__';

type Check = { name: string; pass: boolean; detail: string };

const checks: Check[] = [];

function check(name: string, pass: boolean, detail = ''): void {
    checks.push({ name, pass, detail });
}

async function run(): Promise<void> {
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
        throw new Error('Failed to bind an ephemeral port');
    }
    const base = `http://127.0.0.1:${address.port}/api`;

    try {
        await upsertUser(USERNAME, PASSWORD);

        // --- unauthenticated access -----------------------------------------------------
        check('GET /auth/me without a cookie is 401', (await fetch(`${base}/auth/me`)).status === 401);
        check('GET /receipts without a cookie is 401', (await fetch(`${base}/receipts`)).status === 401);
        check('GET /accounts without a cookie is 401', (await fetch(`${base}/accounts`)).status === 401);
        check('GET /health stays public', (await fetch(`${base}/health`)).status === 200);

        // --- failed logins --------------------------------------------------------------
        const wrong = await fetch(`${base}/auth/login`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ username: USERNAME, password: 'wrong' }),
        });
        const wrongBody = (await wrong.json()) as { message?: string };
        check('wrong password is 401', wrong.status === 401, `got ${wrong.status}`);
        check('wrong password sets no cookie', !wrong.headers.get('set-cookie'));

        const unknown = await fetch(`${base}/auth/login`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ username: '__no_such_user__', password: 'wrong' }),
        });
        const unknownBody = (await unknown.json()) as { message?: string };
        check(
            'unknown user is indistinguishable from wrong password',
            unknown.status === 401 && unknownBody.message === wrongBody.message,
            `${unknownBody.message} vs ${wrongBody.message}`,
        );

        // --- successful login -----------------------------------------------------------
        const login = await fetch(`${base}/auth/login`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
        });
        const setCookie = login.headers.get('set-cookie') ?? '';
        const cookie = setCookie.split(';')[0] ?? '';
        const loginBody = JSON.stringify(await login.json());

        check('correct password is 200', login.status === 200, `got ${login.status}`);
        check('cookie is HttpOnly', /HttpOnly/i.test(setCookie), setCookie);
        check('cookie is SameSite=Lax', /SameSite=Lax/i.test(setCookie), setCookie);
        check('cookie carries a long expiry', /Expires=/i.test(setCookie), setCookie);
        check('login body carries no token or hash', !/token|hash|password/i.test(loginBody), loginBody);

        // --- authenticated access -------------------------------------------------------
        const me = await fetch(`${base}/auth/me`, { headers: { cookie } });
        const meBody = JSON.stringify(await me.json());
        check('GET /auth/me with a cookie is 200', me.status === 200, `got ${me.status}`);
        check('/auth/me names the signed-in user', meBody.includes(USERNAME), meBody);
        check('/auth/me leaks no hash', !/hash|password/i.test(meBody), meBody);

        const tampered = await fetch(`${base}/auth/me`, {
            headers: { cookie: `${cookie.slice(0, -1)}${cookie.endsWith('A') ? 'B' : 'A'}` },
        });
        check('a tampered cookie is rejected', tampered.status === 401, `got ${tampered.status}`);

        // --- logout ---------------------------------------------------------------------
        const logout = await fetch(`${base}/auth/logout`, { method: 'POST', headers: { cookie } });
        check('logout is 200', logout.status === 200, `got ${logout.status}`);

        const afterLogout = await fetch(`${base}/auth/me`, { headers: { cookie } });
        check('the cookie is dead after logout', afterLogout.status === 401, `got ${afterLogout.status}`);

        const doubleLogout = await fetch(`${base}/auth/logout`, { method: 'POST' });
        check('logout while signed out is safe', doubleLogout.status === 200, `got ${doubleLogout.status}`);

        const empty = await fetch(`${base}/auth/login`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ username: '', password: '' }),
        });
        check('empty credentials are rejected', empty.status >= 400 && empty.status < 500, `got ${empty.status}`);
    } finally {
        const user = await findUserByUsername(USERNAME);
        if (user) {
            await deleteSessionsForUser(user.id);
            const db = await getAppDatabase();
            await db.deleteFrom('users').where('id', '=', user.id).execute();
        }
        server.close();
    }
}

void run()
    .then(() => {
        const failed = checks.filter((entry) => !entry.pass);
        for (const entry of checks) {
            console.log(`${entry.pass ? 'PASS' : 'FAIL'}  ${entry.name}${entry.pass ? '' : `   <-- ${entry.detail}`}`);
        }
        console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
        process.exitCode = failed.length ? 1 : 0;
    })
    .catch((error: unknown) => {
        console.error(error instanceof Error ? error.stack : String(error));
        process.exitCode = 1;
    })
    .finally(() => {
        void getAppDatabase().then((db) => db.destroy());
    });
