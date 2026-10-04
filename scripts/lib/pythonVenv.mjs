import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function venvPython(venvDir) {
    return process.platform === 'win32' ? join(venvDir, 'Scripts', 'python.exe') : join(venvDir, 'bin', 'python');
}

/**
 * Creates the venv on first run, and reinstalls whenever the requirements file changes.
 * `afterInstall(python)` runs after each install, inside the same stamp, for steps such as
 * downloading a browser. Returns the venv's python.
 */
export function ensureVenv({ venvDir, requirements, cwd, afterInstall }) {
    const python = venvPython(venvDir);
    const stamp = join(venvDir, '.requirements.sha256');
    const digest = createHash('sha256').update(readFileSync(requirements)).digest('hex');
    if (existsSync(python) && existsSync(stamp) && readFileSync(stamp, 'utf8') === digest) {
        return python;
    }
    if (!existsSync(python)) {
        console.log(`Creating ${venvDir} ...`);
        runChecked(process.platform === 'win32' ? 'python' : 'python3', ['-m', 'venv', venvDir], { cwd });
    }
    console.log(`Installing ${requirements} ...`);
    runChecked(python, ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', requirements], { cwd });
    afterInstall?.(python);
    writeFileSync(stamp, digest);
    return python;
}

/** Runs a command with the terminal attached, exiting this process if it fails. */
export function runChecked(command, args, { cwd }) {
    const status = run(command, args, { cwd });
    if (status !== 0) {
        console.error(`Failed: ${command} ${args.join(' ')}`);
        process.exit(status ?? 1);
    }
}

/** Runs a command with the terminal attached and returns its exit status. */
export function run(command, args, { cwd }) {
    return spawnSync(command, args, { cwd, stdio: 'inherit', windowsHide: true }).status;
}
