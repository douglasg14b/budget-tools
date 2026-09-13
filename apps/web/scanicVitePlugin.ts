import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const require = createRequire(import.meta.url);
const webRoot = path.dirname(fileURLToPath(import.meta.url));

const SCANIC_ML_URL_PREFIX = '/scanic-ml/';
const SCANIC_VENDOR_DIR = path.join(webRoot, 'vendor', 'scanic');

function scanicDistDir(): string {
    return path.dirname(require.resolve('scanic'));
}

function scanicMlDistDir(): string {
    return path.join(path.dirname(require.resolve('scanic-ml/package.json')), 'dist');
}

function syncScanicVendor(): string {
    fs.mkdirSync(path.dirname(SCANIC_VENDOR_DIR), { recursive: true });
    fs.cpSync(scanicDistDir(), SCANIC_VENDOR_DIR, { recursive: true });
    return SCANIC_VENDOR_DIR;
}

function isInsideDir(root: string, candidate: string): boolean {
    const relative = path.relative(path.resolve(root), path.resolve(candidate));
    return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function contentTypeFor(filePath: string): string {
    if (filePath.endsWith('.wasm')) {
        return 'application/wasm';
    }
    if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
        return 'text/javascript';
    }
    return 'application/octet-stream';
}

function serveDistPrefix(urlPrefix: string, distDir: string) {
    return (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
        const url = req.url ?? '';
        if (!url.startsWith(urlPrefix)) {
            next();
            return;
        }
        const relative = decodeURIComponent(url.slice(urlPrefix.length).split('?')[0] ?? '');
        if (!relative) {
            next();
            return;
        }
        const filePath = path.normalize(path.join(distDir, relative));
        if (!isInsideDir(distDir, filePath) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
            next();
            return;
        }
        res.setHeader('Content-Type', contentTypeFor(filePath));
        fs.createReadStream(filePath).on('error', next).pipe(res);
    };
}

function isScanicEntry(id: string): boolean {
    const withoutQuery = (id.split('?')[0] ?? id).replaceAll('\\', '/');
    return withoutQuery.endsWith('/vendor/scanic/scanic.js') || withoutQuery.endsWith('/scanic/dist/scanic.js');
}

/**
 * Copy Scanic's ESM into apps/web/vendor so Vite serves /vendor/scanic/*.js
 * (no optimizer sibling hole, no /@fs/ URLs with spaces). Host scanic-ml assets
 * at /scanic-ml/ so the phone does not fetch jsDelivr.
 */
export function scanicNativeEsmPlugin(): Plugin {
    const vendorDir = syncScanicVendor();
    const scanicMlDist = scanicMlDistDir();
    return {
        name: 'scanic-native-esm',
        config() {
            return {
                optimizeDeps: {
                    exclude: ['scanic'],
                },
                resolve: {
                    alias: {
                        scanic: path.join(vendorDir, 'scanic.js'),
                    },
                },
            };
        },
        transform(code, id) {
            if (!isScanicEntry(id) || !code.includes('webpackIgnore')) {
                return null;
            }
            return {
                code: code.replaceAll('/* webpackIgnore: true */', ''),
                map: null,
            };
        },
        configureServer(server) {
            server.middlewares.use(serveDistPrefix(SCANIC_ML_URL_PREFIX, scanicMlDist));
        },
        writeBundle(outputOptions) {
            const outDir = outputOptions.dir;
            if (!outDir) {
                throw new Error('Scanic ML assets require Vite to emit a directory (build.outDir).');
            }
            fs.cpSync(scanicMlDist, path.join(outDir, 'scanic-ml'), { recursive: true });
        },
    };
}
