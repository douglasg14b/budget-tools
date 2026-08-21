import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Ascends the filesystem from a given directory until it locates the repo root.
 *
 * Suitable only for build scripts, tests, and similar tooling.
 */
export function findRepoRoot(dir: string): string {
    if (existsSync(join(dir, '.git')) || existsSync(join(dir, 'pnpm-workspace.yaml'))) {
        return dir;
    }
    const parentDir = dirname(dir);
    if (parentDir === dir) {
        throw new Error(`Repository root not found from source directory: ${dir}`);
    }
    return findRepoRoot(parentDir);
}

/**
 * Locates the repo root by ascending from the directory of the running script.
 *
 * Suitable only for build scripts, tests, and similar tooling.
 */
export function findIsomorphicRepoRoot(): string {
    return findRepoRoot(getDirName());
}

function getDirName(): string {
    try {
        return __dirname;
    } catch (_error) {
        return fileURLToPath(new URL('.', import.meta.url));
    }
}
