import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

const USAGE = 'Usage: node .cursor/skills/move-files/scripts/move.mjs --from <src> --to <dst>';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
    const key = process.argv[i];
    if (key === '--help' || key === '-h') {
        console.log(USAGE);
        process.exit(0);
    }

    if (key.startsWith('--')) {
        const value = process.argv[i + 1];
        if (!value || value.startsWith('--')) {
            throw new Error(`Missing value for ${key}. ${USAGE}`);
        }
        args.set(key, value);
        i += 1;
    }
}

const fromArg = args.get('--from');
const toArg = args.get('--to');

if (!fromArg || !toArg) {
    throw new Error(`Both --from and --to are required. ${USAGE}`);
}

const fromPath = path.resolve(process.cwd(), fromArg);
const toPath = path.resolve(process.cwd(), toArg);

if (fromPath === toPath) {
    throw new Error('Source and destination are the same.');
}

async function ensureExists(target) {
    try {
        await fs.lstat(target);
    } catch (error) {
        if (error && error.code === 'ENOENT') {
            throw new Error(`Source path does not exist: ${target}`);
        }
        throw error;
    }
}

async function ensureNotExists(target) {
    try {
        await fs.lstat(target);
        throw new Error(`Destination already exists: ${target}`);
    } catch (error) {
        if (error && error.code === 'ENOENT') {
            return;
        }
        throw error;
    }
}

async function copyThenRemove(source, destination, stats) {
    if (stats.isSymbolicLink()) {
        throw new Error('Symlink moves across devices are not supported.');
    }

    if (stats.isDirectory()) {
        const relative = path.relative(source, destination);
        const movesInsideSelf = relative && !relative.startsWith('..') && !path.isAbsolute(relative);
        if (movesInsideSelf) {
            throw new Error('Destination cannot be inside the source directory.');
        }

        await fs.cp(source, destination, {
            recursive: true,
            errorOnExist: true,
            force: false,
        });
        await fs.rm(source, { recursive: true, force: false });
        return;
    }

    await fs.copyFile(source, destination, fsConstants.COPYFILE_EXCL);
    await fs.unlink(source);
}

async function movePath(source, destination) {
    await ensureExists(source);
    await ensureNotExists(destination);
    await fs.mkdir(path.dirname(destination), { recursive: true });

    try {
        await fs.rename(source, destination);
        return;
    } catch (error) {
        if (!error || error.code !== 'EXDEV') {
            throw error;
        }
    }

    const stats = await fs.lstat(source);
    await copyThenRemove(source, destination, stats);
}

await movePath(fromPath, toPath);
console.log(`Moved: ${fromArg} -> ${toArg}`);
