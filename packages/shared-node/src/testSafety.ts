import net from 'node:net';

/**
 * Guards for Vitest runs. `.env.local` points at production (Postgres, S3, YNAB), so a test
 * must never be able to reach anything off this machine, however it was started.
 */

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** Variables that point at, or unlock, something remote. */
const REMOTE_ENV_PATTERNS: readonly RegExp[] = [
    /^DB_CONNECTION_STRING$/,
    /^DATABASE_URL$/,
    /^PG(HOST|HOSTADDR|PORT|USER|PASSWORD|DATABASE|SERVICE)$/,
    /^YNAB_API_KEY$/,
    /^YNAB_BUDGET_NAME$/,
    /^OPENROUTER_API_KEY$/,
    /_S3_/,
    /^RUSTFS_/,
    /^AWS_/,
    /^AMAZON_SYNC_URL$/,
    /^AMAZON_COOKIES_/,
    /^AMAZON_ORDERS_MCP_ENTRY$/,
    /^CATEGORIZATION_SCORER_URL$/,
];

const GUARD_INSTALLED = Symbol.for('budget-tools.blockRemoteNetwork');

type GuardedSocketPrototype = net.Socket & { [GUARD_INSTALLED]?: true };

/**
 * Removes every remote-pointing variable from `process.env`, whatever loaded it (a shell
 * export, `dotenvx run -f .env.local -- pnpm test`, a parent `pnpm dev`). `keep` names
 * variables an explicit live-test command is allowed to pass through. Returns what was removed.
 */
export function stripRemoteEnv(keep: readonly string[] = []): string[] {
    const keepSet = new Set(keep);
    const removed: string[] = [];
    for (const name of Object.keys(process.env)) {
        if (!keepSet.has(name) && REMOTE_ENV_PATTERNS.some((pattern) => pattern.test(name))) {
            delete process.env[name];
            removed.push(name);
        }
    }
    return removed;
}

/**
 * Makes every outbound TCP/TLS connection to a non-loopback host throw. Patching
 * `net.Socket.prototype.connect` covers pg, fetch/undici, http(s), and the AWS SDK alike.
 * Local pipes and loopback stay open so tests can talk to servers they start themselves.
 */
export function blockRemoteNetwork(allowedHosts: readonly string[] = []): void {
    const prototype = net.Socket.prototype as GuardedSocketPrototype;
    if (prototype[GUARD_INSTALLED]) {
        return;
    }
    const allowed = new Set([...LOOPBACK_HOSTS, ...allowedHosts.map((host) => host.toLowerCase())]);
    const originalConnect = prototype.connect;

    prototype.connect = function guardedConnect(this: net.Socket, ...args: unknown[]) {
        const target = connectTarget(args);
        if (target.kind === 'tcp' && !isAllowedHost(target.host, allowed)) {
            throw new Error(
                `Blocked a network connection to ${target.host}:${String(target.port)} from a test. ` +
                    'Tests must not reach remote services (production lives behind .env.local). ' +
                    'Use the PGlite test database (createTestAppDatabase) or mock the client.',
            );
        }
        return Reflect.apply(originalConnect, this, args) as net.Socket;
    } as typeof originalConnect;
    prototype[GUARD_INSTALLED] = true;
}

type ConnectTarget = { kind: 'pipe' } | { kind: 'tcp'; host: string; port: unknown };

/** Reads the destination out of every `Socket#connect` overload, including net's pre-normalized array form. */
function connectTarget(args: readonly unknown[]): ConnectTarget {
    const first = Array.isArray(args[0]) ? (args[0] as unknown[])[0] : args[0];
    if (typeof first === 'object' && first !== null) {
        const options = first as { host?: unknown; port?: unknown; path?: unknown };
        if (typeof options.path === 'string') {
            return { kind: 'pipe' };
        }
        return { kind: 'tcp', host: typeof options.host === 'string' ? options.host : 'localhost', port: options.port };
    }
    if (typeof first === 'string' && Number.isNaN(Number(first))) {
        return { kind: 'pipe' };
    }
    return { kind: 'tcp', host: typeof args[1] === 'string' ? args[1] : 'localhost', port: first };
}

function isAllowedHost(host: string, allowed: ReadonlySet<string>): boolean {
    const normalized = host.toLowerCase().replace(/^\[|\]$/g, '');
    return allowed.has(normalized) || /^127\.\d+\.\d+\.\d+$/.test(normalized);
}
