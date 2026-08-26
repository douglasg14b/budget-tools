import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const cloneDir = join(repoRoot, 'third_party', 'amazon-order-history-csv-download-mcp');
const entryRelative = 'third_party/amazon-order-history-csv-download-mcp/dist/index.js';
const entryPath = join(repoRoot, entryRelative);
const upstream = 'https://github.com/marcusquinn/amazon-order-history-csv-download-mcp.git';
/** Extractor that understands Amazon's apx- Your Payments markup (upstream pull/3). */
const pinSha = '879be8b4dbd861f63d78645d9e107548f198dd06';

ensureClone();
run('npm', ['install'], cloneDir);
run('npm', ['run', 'build'], cloneDir);
run('npx', ['playwright', 'install', 'chromium'], cloneDir);

if (!existsSync(entryPath)) {
    throw new Error(`Amazon MCP build did not produce ${entryRelative}`);
}

upsertAmazonMcpEntry(join(repoRoot, '.env.local'), entryRelative);
console.log(`Amazon MCP ready at ${entryRelative}`);
console.log('First POST /api/amazon-orders/sync opens headed Chromium for Amazon login.');

function ensureClone() {
    mkdirSync(join(repoRoot, 'third_party'), { recursive: true });
    if (!existsSync(join(cloneDir, '.git'))) {
        run('git', ['clone', '--no-checkout', upstream, cloneDir]);
    }
    run('git', ['fetch', '--depth', '50', 'origin', 'pull/3/head'], cloneDir);
    run('git', ['checkout', '--detach', '--force', pinSha], cloneDir);
    const head = capture('git', ['rev-parse', 'HEAD'], cloneDir).trim();
    if (head !== pinSha) {
        throw new Error(`Amazon MCP checkout was ${head}, expected ${pinSha}`);
    }
    applyLocalPatches();
}

function applyLocalPatches() {
    const patchDir = join(repoRoot, 'third_party', 'patches');
    const patchPath = join(patchDir, 'amazon-mcp-multi-item.patch');
    if (!existsSync(patchPath)) {
        throw new Error(`Amazon MCP patch was not found at ${patchPath}`);
    }
    run('git', ['apply', '--whitespace=nowarn', patchPath], cloneDir);
}

function upsertAmazonMcpEntry(envPath, relativeEntry) {
    const line = `AMAZON_ORDERS_MCP_ENTRY=${relativeEntry}`;
    if (!existsSync(envPath)) {
        console.log(`No .env.local yet. Add:\n${line}`);
        return;
    }
    let text = readFileSync(envPath, 'utf8');
    if (/^AMAZON_ORDERS_MCP_ENTRY=/m.test(text)) {
        text = text.replace(/^AMAZON_ORDERS_MCP_ENTRY=.*$/m, line);
    } else {
        if (!text.endsWith('\n')) {
            text += '\n';
        }
        text += `${line}\n`;
    }
    writeFileSync(envPath, text);
}

function run(command, args, cwd = repoRoot) {
    const result = spawnSync(command, args, spawnOptions(command, cwd, 'inherit'));
    if (result.error) {
        throw new Error(`${command} ${args.join(' ')} failed: ${result.error.message}`);
    }
    if (result.status !== 0) {
        throw new Error(`${command} ${args.join(' ')} failed with exit ${result.status ?? 'null'}`);
    }
}

function capture(command, args, cwd) {
    const result = spawnSync(command, args, spawnOptions(command, cwd, 'pipe', 'utf8'));
    if (result.error) {
        throw new Error(`${command} ${args.join(' ')} failed: ${result.error.message}`);
    }
    if (result.status !== 0) {
        throw new Error(`${command} ${args.join(' ')} failed with exit ${result.status ?? 'null'}`);
    }
    return result.stdout ?? '';
}

function spawnOptions(command, cwd, stdio, encoding) {
    const npmOnWindows = process.platform === 'win32' && (command === 'npm' || command === 'npx');
    return {
        cwd,
        encoding,
        shell: npmOnWindows,
        stdio,
        windowsHide: true,
    };
}
