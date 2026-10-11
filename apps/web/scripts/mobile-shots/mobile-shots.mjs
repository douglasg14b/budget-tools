#!/usr/bin/env node
// @ts-check
/**
 * Mobile-viewport screenshot harness for the web app.
 *
 * Renders each route at phone size (and optionally desktop) in the installed system Chrome,
 * with EVERY `/api/**` request answered from synthetic fixtures (./fixtures). Nothing reaches the
 * Vite proxy or the real API: an `/api` request with no fixture is aborted and reported, and any
 * request to a non-localhost host is aborted too. Service workers are blocked so they cannot
 * bypass interception.
 *
 * Only the Vite web dev server is ever started (never the API, scorer, or amazon-sync).
 *
 * Usage (from apps/web):
 *   pnpm shots:mobile
 *   pnpm shots:mobile -- --routes /,/classify --viewport both --mode live
 *
 * Options:
 *   --routes <list>     Comma-separated routes. Default: all known routes.
 *   --out <dir>         Output directory. Default: scripts/mobile-shots/out
 *   --viewport <v>      mobile | desktop | both. Default: mobile (390x844, DPR 2, touch).
 *   --width/--height    Override the mobile viewport size.
 *   --mode <m>          practice | live — what GET /operating-mode returns. Default: practice.
 *   --url <base>        Dev server base URL. Default: https://localhost:5173
 *   --no-start          Fail instead of starting Vite when the server is not already running.
 *   --headed            Show the browser window.
 *   --help
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import https from 'node:https';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { chromium } from 'playwright-core';

import { resolveFixture } from './fixtures/router.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(HERE, '..', '..');

const DEFAULT_ROUTES = [
    '/',
    '/classify',
    '/classify/table',
    '/receipts',
    '/repeating',
    '/trips',
    '/spending',
    '/configure',
    '@review-filters',
    '@review-certain',
    '@review-accept',
    '@sheet',
    '@sheet-drag',
    '@sheet-swipe',
    '@sheet-flick',
    '@sheet-short',
    '@sheet-next-tap',
    '@sheet-accept',
    '@sheet-open-other',
    '@sheet-close',
];

/**
 * Interaction scenarios, named `@<name>` in --routes: load `path`, settle, then `run` before the
 * screenshot. Fixture data only, so taps never reach a real API.
 * @type {Record<string, { path: string; run: (page: import('playwright-core').Page) => Promise<void> }>}
 */
const SCENARIOS = {
    'review-filters': {
        path: '/',
        run: async (page) => {
            await page.getByRole('button', { name: 'Search and filters' }).click();
        },
    },
    'review-certain': {
        path: '/',
        run: async (page) => {
            await page.getByText(/^Certain \d+$/).click();
        },
    },
    // Practice accepts at once; with --mode live this stops on the confirm dialog.
    'review-bulk': {
        path: '/',
        run: async (page) => {
            await page.getByText(/^Certain \d+$/).click();
            await page.getByRole('button', { name: /^Accept all \d+ certain$/ }).click();
        },
    },
    'review-accept': {
        path: '/',
        run: async (page) => {
            await page
                .getByRole('button', { name: /^Accept .* for / })
                .first()
                .click();
        },
    },
    'sheet-note': {
        path: '/',
        run: async (page) => {
            await page.locator('[data-row-id] button').first().click();
            await page.getByRole('button', { name: 'Add note' }).click();
            await page.keyboard.type('Split with Sam');
        },
    },
    sheet: {
        path: '/',
        run: async (page) => {
            await page.locator('[data-row-id] button').first().click();
        },
    },
    // Leftward = next. Mid-drag: the next card should be sliding in from the right.
    'sheet-drag': {
        path: '/',
        run: async (page) => {
            await page.locator('[data-row-id] button').first().click();
            await page.waitForTimeout(400);
            await swipe(page, 300, -170, { release: false });
        },
    },
    'sheet-swipe': {
        path: '/',
        run: async (page) => {
            await page.locator('[data-row-id] button').first().click();
            await page.waitForTimeout(400);
            await swipe(page, 300, -170);
            await page.waitForTimeout(500);
        },
    },
    // Short but fast: should still page.
    'sheet-flick': {
        path: '/',
        run: async (page) => {
            await page.locator('[data-row-id] button').first().click();
            await page.waitForTimeout(400);
            await flick(page, 300, -60);
            await page.waitForTimeout(500);
        },
    },
    // Short and slow: should spring back to the same card.
    'sheet-short': {
        path: '/',
        run: async (page) => {
            await page.locator('[data-row-id] button').first().click();
            await page.waitForTimeout(400);
            await swipe(page, 300, -60, { stepMs: 40 });
            await page.waitForTimeout(500);
        },
    },
    // A row that isn't already focused, tapped once: the sheet must open on it first time.
    'sheet-open-other': {
        path: '/',
        run: async (page) => {
            await page.locator('[data-row-id] button').nth(6).click();
            await page.waitForTimeout(300);
            const sheet = await page.getByRole('region', { name: 'Classify transaction' }).count();
            if (sheet === 0) {
                throw new Error('sheet-open-other: one tap on row 7 did not open the sheet');
            }
        },
    },
    // Open then close: X should pop back to the list entry, not stack a new one.
    'sheet-close': {
        path: '/',
        run: async (page) => {
            const before = await page.evaluate(() => window.history.length);
            await page.locator('[data-row-id] button').nth(6).click();
            await page.waitForTimeout(300);
            await page.getByRole('button', { name: 'Back to list' }).click();
            await page.waitForTimeout(300);
            const after = await page.evaluate(() => ({
                path: window.location.pathname,
                sheets: document.querySelectorAll('[aria-label="Classify transaction"]').length,
                length: window.history.length,
            }));
            if (after.path !== '/' || after.sheets !== 0) {
                throw new Error(`sheet-close: still open (${JSON.stringify(after)})`);
            }
            // One forward entry (the sheet) is expected; a replace-close would leave the same count
            // but a push-close would add another.
            if (after.length > before + 1) {
                throw new Error(`sheet-close: history grew ${before} → ${after.length}`);
            }
        },
    },
    'sheet-accept': {
        path: '/',
        run: async (page) => {
            await page.locator('[data-row-id] button').first().click();
            await page.waitForTimeout(400);
            await page.getByRole('button', { name: 'Accept', exact: true }).click();
            await page.waitForTimeout(500);
        },
    },
    'sheet-next-tap': {
        path: '/',
        run: async (page) => {
            await page.locator('[data-row-id] button').first().click();
            await page.waitForTimeout(400);
            await page.getByRole('button', { name: 'Next transaction' }).click();
            await page.waitForTimeout(500);
        },
    },
};

/**
 * A one-finger horizontal drag through CDP (Playwright's touchscreen only taps).
 * @param {import('playwright-core').Page} page
 * @param {number} fromX
 * @param {number} distance positive = rightward
 * @param {{ release?: boolean, stepMs?: number, steps?: number }} [options] `release: false` holds the finger down
 */
async function swipe(page, fromX, distance, { release = true, stepMs = 16, steps = 10 } = {}) {
    const cdp = await page.context().newCDPSession(page);
    const y = 500;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fromX, y }] });
    for (let step = 1; step <= steps; step++) {
        if (stepMs > 0) {
            await page.waitForTimeout(stepMs);
        }
        await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: fromX + (distance * step) / steps, y }],
        });
    }
    if (release) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    await cdp.detach();
}

/**
 * A fast flick, dispatched inside the page at ~8ms per move. CDP round trips take 20-60ms per
 * event headless, far too slow to look like a real flick.
 * @param {import('playwright-core').Page} page
 * @param {number} fromX
 * @param {number} distance positive = rightward
 */
async function flick(page, fromX, distance) {
    await page.evaluate(
        async ({ fromX, distance }) => {
            const y = 500;
            const target = document.elementFromPoint(fromX, y);
            if (!target) {
                throw new Error('flick: nothing under the start point');
            }
            /** @param {string} type @param {number} x @param {boolean} down */
            const fire = (type, x, down) => {
                const touch = new Touch({ identifier: 1, target, clientX: x, clientY: y });
                target.dispatchEvent(
                    new TouchEvent(type, {
                        bubbles: true,
                        cancelable: true,
                        touches: down ? [touch] : [],
                        targetTouches: down ? [touch] : [],
                        changedTouches: [touch],
                    }),
                );
            };
            const pause = () => new Promise((resolve) => setTimeout(resolve, 8));
            const steps = 5;
            fire('touchstart', fromX, true);
            for (let step = 1; step <= steps; step++) {
                await pause();
                fire('touchmove', fromX + (distance * step) / steps, true);
            }
            fire('touchend', fromX + distance, false);
        },
        { fromX, distance },
    );
}
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

const MOBILE_UA =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

const red = (/** @type {string} */ text) => `\x1b[31m${text}\x1b[0m`;
const yellow = (/** @type {string} */ text) => `\x1b[33m${text}\x1b[0m`;
const green = (/** @type {string} */ text) => `\x1b[32m${text}\x1b[0m`;
const dim = (/** @type {string} */ text) => `\x1b[2m${text}\x1b[0m`;

// ---------------------------------------------------------------------------------------------
// CLI

// `pnpm shots:mobile -- --x` forwards the literal `--`; drop it so parseArgs sees the flags.
const argv = process.argv.slice(2);
if (argv[0] === '--') {
    argv.shift();
}

const { values: args } = parseArgs({
    args: argv,
    options: {
        routes: { type: 'string' },
        out: { type: 'string' },
        viewport: { type: 'string', default: 'mobile' },
        width: { type: 'string', default: '390' },
        height: { type: 'string', default: '844' },
        mode: { type: 'string', default: 'practice' },
        url: { type: 'string', default: 'https://localhost:5173' },
        'no-start': { type: 'boolean', default: false },
        headed: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
    },
    allowPositionals: false,
});

if (args.help) {
    const source = await import('node:fs').then((fs) => fs.readFileSync(fileURLToPath(import.meta.url), 'utf8'));
    const usage = source
        .split('*/')[0]
        .replace(/^[\s\S]*?\/\*\*/, '')
        .replace(/^ \* ?/gm, '');
    console.log(usage.trim());
    process.exit(0);
}

const routes = (args.routes ? args.routes.split(',') : DEFAULT_ROUTES).map((route) => {
    let trimmed = route.trim();
    // Git Bash (MSYS) rewrites a leading `/receipts` into `C:/Program Files/Git/receipts`.
    // Undo that; or pass routes without the leading slash (`receipts,classify`).
    const msys = trimmed.match(/^[A-Za-z]:[\\/].*?[\\/]Git([\\/].*)?$/);
    if (msys) {
        const repaired = (msys[1] ?? '/').replaceAll('\\', '/');
        console.warn(yellow(`Route "${trimmed}" looks MSYS-mangled; using "${repaired}".`));
        trimmed = repaired;
    }
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
});
const outRoot = path.resolve(args.out ?? path.join(HERE, 'out'));
const mode = args.mode === 'live' ? 'live' : 'practice';
if (args.mode !== 'live' && args.mode !== 'practice') {
    throw new Error(`--mode must be practice or live, got ${args.mode}`);
}

/** @type {Array<{ name: string; width: number; height: number; deviceScaleFactor: number; isMobile: boolean; hasTouch: boolean }>} */
const viewports = [];
const mobileViewport = {
    name: 'mobile',
    width: Number(args.width),
    height: Number(args.height),
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
};
const desktopViewport = {
    name: 'desktop',
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
};
if (args.viewport === 'mobile' || args.viewport === 'both') {
    viewports.push(mobileViewport);
}
if (args.viewport === 'desktop' || args.viewport === 'both') {
    viewports.push(desktopViewport);
}
if (viewports.length === 0) {
    throw new Error(`--viewport must be mobile, desktop, or both, got ${args.viewport}`);
}

// ---------------------------------------------------------------------------------------------
// Dev server

/** Resolves true when `url` answers any HTTP status over HTTPS/HTTP. */
function probe(/** @type {string} */ url) {
    return new Promise((resolve) => {
        const request = https.get(url, { rejectUnauthorized: false, timeout: 3000 }, (response) => {
            response.resume();
            resolve(true);
        });
        request.on('error', () => resolve(false));
        request.on('timeout', () => {
            request.destroy();
            resolve(false);
        });
    });
}

/** @type {import('node:child_process').ChildProcess | null} */
let viteProcess = null;

function stopVite() {
    if (!viteProcess || viteProcess.exitCode !== null || viteProcess.pid === undefined) {
        viteProcess = null;
        return;
    }
    const pid = viteProcess.pid;
    if (process.platform === 'win32') {
        spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
        viteProcess.kill('SIGTERM');
    }
    console.log(dim(`Stopped Vite dev server (pid ${pid}).`));
    viteProcess = null;
}

/**
 * Starts ONLY the web app's Vite dev server (node + vite/bin/vite.js, no shell, cwd apps/web)
 * and resolves with the `Local:` URL it prints.
 * @returns {Promise<string>}
 */
function startVite() {
    // vite's "exports" hides bin/, so locate the package root via its main entry instead.
    const require = createRequire(path.join(WEB_ROOT, 'package.json'));
    let viteRoot = path.dirname(require.resolve('vite'));
    while (!existsSync(path.join(viteRoot, 'bin', 'vite.js')) && path.dirname(viteRoot) !== viteRoot) {
        viteRoot = path.dirname(viteRoot);
    }
    const viteBin = path.join(viteRoot, 'bin', 'vite.js');
    console.log(dim(`Starting Vite dev server: ${process.execPath} ${viteBin} (cwd ${WEB_ROOT})`));
    const child = spawn(process.execPath, [viteBin], {
        cwd: WEB_ROOT,
        env: { ...process.env, BROWSER: 'none', FORCE_COLOR: '0' },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
    });
    viteProcess = child;

    return new Promise((resolve, reject) => {
        let output = '';
        const timer = setTimeout(() => {
            reject(new Error(`Vite did not report a Local URL within 90s. Output so far:\n${output}`));
        }, 90_000);
        const onData = (/** @type {Buffer} */ chunk) => {
            output += chunk.toString();
            // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI escapes
            const plain = output.replace(/\x1b\[[0-9;]*m/g, '');
            const match = plain.match(/Local:\s+(https?:\/\/[^\s]+)/);
            if (match) {
                clearTimeout(timer);
                resolve(match[1].replace(/\/$/, ''));
            }
        };
        child.stdout?.on('data', onData);
        child.stderr?.on('data', onData);
        child.on('exit', (code) => {
            clearTimeout(timer);
            reject(new Error(`Vite exited early with code ${code}. Output:\n${output}`));
        });
    });
}

/** @returns {Promise<string>} the base URL to shoot against */
async function ensureServer() {
    const base = /** @type {string} */ (args.url).replace(/\/$/, '');
    if (await probe(base)) {
        console.log(dim(`Reusing dev server at ${base}`));
        return base;
    }
    if (args['no-start']) {
        throw new Error(`No dev server at ${base} and --no-start was given.`);
    }
    const local = await startVite();
    for (let attempt = 0; attempt < 60; attempt++) {
        if (await probe(local)) {
            console.log(dim(`Vite is serving ${local}`));
            return local;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Vite printed ${local} but it never answered.`);
}

// ---------------------------------------------------------------------------------------------
// Overflow measurement (runs in the page)

/**
 * @returns {{
 *   scrollWidth: number; clientWidth: number; innerWidth: number; bodyScrollWidth: number;
 *   htmlOverflowX: string; bodyOverflowX: string; offenderCount: number; clippedCount: number;
 *   offenders: Array<{ desc: string; text: string; left: number; right: number; width: number; root: boolean; clippedBy: string | null; position: string }>;
 * }}
 */
function measureOverflowInPage() {
    const scroller = document.scrollingElement ?? document.documentElement;
    const viewportWidth = document.documentElement.clientWidth;
    const tolerance = 0.5;

    const describe = (/** @type {Element} */ el) => {
        const id = el.id ? `#${el.id}` : '';
        const classes = [...el.classList]
            .slice(0, 4)
            .map((name) => `.${name}`)
            .join('');
        const role = el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : '';
        return `${el.tagName.toLowerCase()}${id}${classes}${role}`;
    };

    /** @type {Map<Element, { el: Element; rect: DOMRect; clippedBy: Element | null; position: string }>} */
    const hits = new Map();
    for (const el of document.body.querySelectorAll('*')) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
            continue;
        }
        if (rect.right <= viewportWidth + tolerance && rect.left >= -tolerance) {
            continue;
        }
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') {
            continue;
        }
        // A scrolling/clipping ancestor that itself fits the viewport contains the overflow
        // (filmstrips, table wrappers); that is not page-level overflow.
        /** @type {Element | null} */
        let clippedBy = null;
        for (
            let ancestor = el.parentElement;
            ancestor && ancestor !== document.body;
            ancestor = ancestor.parentElement
        ) {
            const overflowX = getComputedStyle(ancestor).overflowX;
            if (overflowX !== 'visible') {
                const ancestorRect = ancestor.getBoundingClientRect();
                if (ancestorRect.right <= viewportWidth + tolerance && ancestorRect.left >= -tolerance) {
                    clippedBy = ancestor;
                    break;
                }
            }
        }
        hits.set(el, { el, rect, clippedBy, position: style.position });
    }

    const offenders = [...hits.values()].map((hit) => ({
        desc: describe(hit.el),
        text: (hit.el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 70),
        left: Math.round(hit.rect.left),
        right: Math.round(hit.rect.right),
        width: Math.round(hit.rect.width),
        root:
            !hit.el.parentElement ||
            !hits.has(hit.el.parentElement) ||
            hits.get(hit.el.parentElement)?.clippedBy !== hit.clippedBy,
        clippedBy: hit.clippedBy ? describe(hit.clippedBy) : null,
        position: hit.position,
    }));
    offenders.sort((a, b) => {
        if (Boolean(a.clippedBy) !== Boolean(b.clippedBy)) {
            return a.clippedBy ? 1 : -1;
        }
        if (a.root !== b.root) {
            return a.root ? -1 : 1;
        }
        return b.right - a.right;
    });

    return {
        scrollWidth: scroller.scrollWidth,
        clientWidth: scroller.clientWidth,
        innerWidth: window.innerWidth,
        bodyScrollWidth: document.body.scrollWidth,
        htmlOverflowX: getComputedStyle(document.documentElement).overflowX,
        bodyOverflowX: getComputedStyle(document.body).overflowX,
        offenderCount: offenders.filter((row) => !row.clippedBy).length,
        clippedCount: offenders.filter((row) => row.clippedBy).length,
        offenders,
    };
}

// ---------------------------------------------------------------------------------------------
// Shooting

/** @param {string} route */
function slugFor(route) {
    const slug = route
        .replace(/^\/+|\/+$/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+/, '');
    return slug || 'root';
}

/**
 * @typedef {{
 *   apiHits: string[]; missing: string[]; blockedExternal: string[];
 *   consoleErrors: string[]; consoleWarnings: number; pageErrors: string[]; failedRequests: string[];
 *   inflight: number; lastApiAt: number;
 * }} RouteLog
 */

/** @returns {RouteLog} */
function freshLog() {
    return {
        apiHits: [],
        missing: [],
        blockedExternal: [],
        consoleErrors: [],
        consoleWarnings: 0,
        pageErrors: [],
        failedRequests: [],
        inflight: 0,
        lastApiAt: Date.now(),
    };
}

/**
 * Installs the single interception handler on the context.
 * @param {import('playwright-core').BrowserContext} context
 * @param {{ current: RouteLog }} logRef
 */
async function installInterception(context, logRef) {
    await context.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const log = logRef.current;

        if (!LOCAL_HOSTS.has(url.hostname)) {
            const line = `${request.method()} ${url.href}`;
            log.blockedExternal.push(line);
            console.error(red(`  [BLOCKED EXTERNAL] ${line}`));
            await route.abort('blockedbyclient');
            return;
        }

        if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
            log.inflight++;
            log.lastApiAt = Date.now();
            try {
                const apiPath = url.pathname.slice('/api'.length) || '/';
                let body = null;
                const raw = request.postData();
                if (raw) {
                    try {
                        body = JSON.parse(raw);
                    } catch {
                        body = raw;
                    }
                }
                const fixture = resolveFixture({
                    method: request.method(),
                    path: apiPath,
                    query: url.searchParams,
                    body,
                    mode,
                });
                const line = `${request.method()} ${url.pathname}${url.search}`;
                if (!fixture) {
                    log.missing.push(line);
                    console.error(red(`  [MISSING FIXTURE — ABORTED] ${line}`));
                    await route.abort('blockedbyclient');
                    return;
                }
                log.apiHits.push(`${line} -> ${fixture.status}`);
                await route.fulfill({ status: fixture.status, contentType: fixture.contentType, body: fixture.body });
            } finally {
                log.inflight--;
                log.lastApiAt = Date.now();
            }
            return;
        }

        await route.continue();
    });
}

/**
 * Waits for the page to settle: load, network idle, no fixture traffic for a beat, fonts.
 * @param {import('playwright-core').Page} page
 * @param {RouteLog} log
 */
async function settle(page, log) {
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
    await page.waitForSelector('main', { timeout: 10_000 }).catch(() => undefined);
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
        if (log.inflight === 0 && Date.now() - log.lastApiAt > 700) {
            break;
        }
        await page.waitForTimeout(100);
    }
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    // Mantine transitions and the debounced search (250ms).
    await page.waitForTimeout(500);
}

/**
 * @param {import('playwright-core').Browser} browser
 * @param {string} baseUrl
 * @param {(typeof viewports)[number]} viewport
 */
async function shootViewport(browser, baseUrl, viewport) {
    // Practice runs land in out/<viewport>/, live-mode runs in out/<viewport>-live/.
    const outDir = path.join(outRoot, mode === 'live' ? `${viewport.name}-live` : viewport.name);
    await rm(outDir, { recursive: true, force: true });
    await mkdir(outDir, { recursive: true });

    const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.deviceScaleFactor,
        isMobile: viewport.isMobile,
        hasTouch: viewport.hasTouch,
        ...(viewport.isMobile ? { userAgent: MOBILE_UA } : {}),
        ignoreHTTPSErrors: true,
        serviceWorkers: 'block',
        colorScheme: 'dark',
        locale: 'en-US',
    });
    /** @type {{ current: RouteLog }} */
    const logRef = { current: freshLog() };
    await installInterception(context, logRef);

    const results = [];
    for (const route of routes) {
        // Scenarios drive the phone layout's controls; the desktop has none of them.
        if (route.startsWith('/@') && !viewport.isMobile) {
            continue;
        }
        const slug = slugFor(route);
        const log = freshLog();
        logRef.current = log;
        const page = await context.newPage();
        page.on('console', (message) => {
            if (message.type() === 'error') {
                log.consoleErrors.push(message.text().slice(0, 500));
            } else if (message.type() === 'warning') {
                log.consoleWarnings++;
            }
        });
        page.on('pageerror', (error) => {
            log.pageErrors.push(`${error.name}: ${error.message}`.slice(0, 500));
        });
        page.on('requestfailed', (request) => {
            const failure = request.failure()?.errorText ?? 'failed';
            log.failedRequests.push(`${request.method()} ${request.url()} (${failure})`);
        });

        console.log(`\n${green('▶')} ${viewport.name} ${viewport.width}x${viewport.height}  ${route}`);
        let navError = null;
        const scenario = route.startsWith('/@') ? SCENARIOS[route.slice(2)] : undefined;
        try {
            if (route.startsWith('/@') && !scenario) {
                throw new Error(`Unknown scenario ${route.slice(1)}`);
            }
            await page.goto(`${baseUrl}${scenario ? scenario.path : route}`, { waitUntil: 'load', timeout: 120_000 });
            await settle(page, log);
            if (scenario) {
                await scenario.run(page);
                await settle(page, log);
            }
        } catch (error) {
            navError = error instanceof Error ? error.message : String(error);
            console.error(red(`  navigation failed: ${navError}`));
        }

        const finalUrl = page.url();
        const finalPath = new URL(finalUrl).pathname + new URL(finalUrl).search;
        const splashText = await page
            .evaluate(() => (document.body.innerText.includes('Loading…') ? 'page still shows "Loading…"' : null))
            .catch(() => null);
        await page.evaluate(() => window.scrollTo(0, 0)).catch(() => undefined);
        const overflow = await page.evaluate(measureOverflowInPage).catch((error) => ({ error: String(error) }));

        const viewportFile = path.join(outDir, `${slug}-viewport.png`);
        const fullFile = path.join(outDir, `${slug}-full.png`);
        await page
            .screenshot({ path: viewportFile, fullPage: false })
            .catch((error) => console.error(red(`  viewport screenshot failed: ${error}`)));
        await page
            .screenshot({ path: fullFile, fullPage: true })
            .catch((error) => console.error(red(`  full screenshot failed: ${error}`)));

        const result = {
            route,
            finalPath,
            redirected: finalPath !== route,
            navError,
            note: splashText,
            files: { viewport: path.relative(outRoot, viewportFile), full: path.relative(outRoot, fullFile) },
            overflow,
            apiHits: log.apiHits,
            missingFixtures: log.missing,
            blockedExternal: log.blockedExternal,
            consoleErrors: log.consoleErrors,
            consoleWarnings: log.consoleWarnings,
            pageErrors: log.pageErrors,
            failedRequests: log.failedRequests.filter((line) => !line.includes('ERR_BLOCKED_BY_CLIENT')),
        };
        results.push(result);
        printRouteSummary(result);
        await page.close();
    }

    await context.close();

    const report = {
        generatedAt: new Date().toISOString(),
        baseUrl,
        mode,
        viewport,
        routes: results,
    };
    const reportFile = path.join(outDir, 'report.json');
    await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`\n${dim('Report:')} ${reportFile}`);
    return results;
}

/** @param {any} result */
function printRouteSummary(result) {
    if (result.redirected) {
        console.log(yellow(`  redirected to ${result.finalPath}`));
    }
    if (result.note) {
        console.log(yellow(`  note: ${result.note}`));
    }
    const overflow = result.overflow;
    if (overflow && 'scrollWidth' in overflow) {
        const pageOverflow = overflow.scrollWidth > overflow.clientWidth;
        const label =
            `  scrollWidth ${overflow.scrollWidth} vs clientWidth ${overflow.clientWidth}` +
            (pageOverflow ? ` (+${overflow.scrollWidth - overflow.clientWidth}px)` : '');
        console.log(pageOverflow ? red(label) : green(label));
        if (overflow.htmlOverflowX !== 'visible' || overflow.bodyOverflowX !== 'visible') {
            console.log(
                dim(`  html overflow-x: ${overflow.htmlOverflowX}, body overflow-x: ${overflow.bodyOverflowX}`),
            );
        }
        const roots = overflow.offenders.filter((/** @type {any} */ row) => !row.clippedBy && row.root);
        console.log(
            `  offenders past right edge: ${overflow.offenderCount} unclipped (${roots.length} root), ${overflow.clippedCount} inside scrollers/clippers`,
        );
        for (const row of roots.slice(0, 12)) {
            console.log(
                red(
                    `    right=${row.right}px width=${row.width}px ${row.position !== 'static' ? `[${row.position}] ` : ''}${row.desc}`,
                ) + dim(`  "${row.text}"`),
            );
        }
        if (roots.length > 12) {
            console.log(dim(`    … ${roots.length - 12} more root offenders in report.json`));
        }
        if (
            roots.some((/** @type {any} */ row) => row.position === 'fixed') &&
            roots.some((/** @type {any} */ row) => row.position !== 'fixed')
        ) {
            console.log(
                dim(
                    '    ([fixed] elements stretch with the widened layout viewport; usually a symptom, not the cause.)',
                ),
            );
        }
    } else if (overflow) {
        console.log(red(`  overflow measurement failed: ${overflow.error}`));
    }
    console.log(dim(`  api hits: ${result.apiHits.length}`));
    for (const line of result.missingFixtures) {
        console.log(red(`  MISSING FIXTURE: ${line}`));
    }
    for (const line of result.blockedExternal) {
        console.log(red(`  BLOCKED EXTERNAL: ${line}`));
    }
    for (const line of result.pageErrors) {
        console.log(red(`  pageerror: ${line}`));
    }
    for (const line of result.consoleErrors) {
        console.log(red(`  console.error: ${line}`));
    }
    for (const line of result.failedRequests) {
        console.log(yellow(`  request failed: ${line}`));
    }
    console.log(dim(`  ${result.files.viewport}, ${result.files.full}`));
}

// ---------------------------------------------------------------------------------------------
// Main

/** @type {import('playwright-core').Browser | null} */
let browser = null;

async function shutdown() {
    await browser?.close().catch(() => undefined);
    stopVite();
}

process.on('SIGINT', () => {
    console.error(yellow('\nInterrupted; cleaning up…'));
    void shutdown().finally(() => process.exit(130));
});

let exitCode = 0;
try {
    const baseUrl = await ensureServer();
    browser = await chromium.launch({ channel: 'chrome', headless: !args.headed });
    let missingTotal = 0;
    let externalTotal = 0;
    for (const viewport of viewports) {
        const results = await shootViewport(browser, baseUrl, viewport);
        missingTotal += results.reduce((sum, row) => sum + row.missingFixtures.length, 0);
        externalTotal += results.reduce((sum, row) => sum + row.blockedExternal.length, 0);
    }
    console.log(`\nScreenshots in ${outRoot}`);
    if (missingTotal > 0 || externalTotal > 0) {
        console.error(
            red(
                `${missingTotal} /api request(s) had no fixture and ${externalTotal} external request(s) were blocked. See report.json.`,
            ),
        );
        exitCode = 2;
    }
} catch (error) {
    console.error(red(error instanceof Error ? (error.stack ?? error.message) : String(error)));
    exitCode = 1;
} finally {
    await shutdown();
}
process.exit(exitCode);
