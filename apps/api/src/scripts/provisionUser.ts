/**
 * Offline user provisioning. There is no signup endpoint — this is the only way an account comes
 * into existence.
 *
 *   pnpm --filter @budget-tools/api provision-user <username>
 *   pnpm --filter @budget-tools/api provision-user --list
 *
 * Prompts twice for a password with echo suppressed, stores an argon2id hash, and never writes the
 * password anywhere. Re-running for an existing username changes that user's password and
 * invalidates their existing sessions.
 */

import process from 'node:process';
import { createInterface } from 'node:readline';

import { getAppDatabase } from '../data-persistence/database';
import { listUsernames, upsertUser } from '../features/auth/data/authRepo';
import { MINIMUM_PASSWORD_LENGTH, passwordComplaint } from '../features/auth/password';

/**
 * Reads a line with echo suppressed. `readline`'s own `_writeToOutput` hook is the only way to
 * silence echo without pulling in a dependency; keystrokes are swallowed so the terminal shows
 * nothing at all (not even asterisks, whose count leaks the password length to a shoulder-surfer).
 */
function promptHidden(question: string): Promise<string> {
    return new Promise((resolve) => {
        const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
        const target = rl as unknown as { _writeToOutput?: (text: string) => void };
        const originalWrite = target._writeToOutput?.bind(rl);

        process.stdout.write(question);
        target._writeToOutput = (text: string): void => {
            // Let newlines through so the cursor still advances; swallow echoed characters.
            if (text.includes('\n') || text.includes('\r')) {
                originalWrite?.(text);
            }
        };

        rl.question('', (answer) => {
            target._writeToOutput = originalWrite;
            rl.close();
            process.stdout.write('\n');
            resolve(answer);
        });
    });
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);

    if (args.includes('--list')) {
        const usernames = await listUsernames();
        console.log(usernames.length ? usernames.map((name) => `  ${name}`).join('\n') : '  (no users provisioned)');
        return;
    }

    const username = args[0]?.trim();
    if (!username || username.startsWith('-')) {
        console.error('Usage: pnpm --filter @budget-tools/api provision-user <username>');
        console.error('       pnpm --filter @budget-tools/api provision-user --list');
        process.exitCode = 1;
        return;
    }

    if (!process.stdin.isTTY) {
        console.error('Refusing to read a password from a non-interactive stdin.');
        process.exitCode = 1;
        return;
    }

    const existing = (await listUsernames()).some((name) => name.toLowerCase() === username.toLowerCase());
    if (existing) {
        console.log(`User "${username}" already exists. Continuing will change their password and sign them out.`);
    }

    const password = await promptHidden(`Password for "${username}" (min ${MINIMUM_PASSWORD_LENGTH} chars): `);
    const complaint = passwordComplaint(password);
    if (complaint) {
        console.error(complaint);
        process.exitCode = 1;
        return;
    }

    const confirmation = await promptHidden('Confirm password: ');
    if (password !== confirmation) {
        console.error('Passwords did not match.');
        process.exitCode = 1;
        return;
    }

    const user = await upsertUser(username, password);
    console.log(existing ? `Updated password for "${user.username}".` : `Provisioned user "${user.username}".`);
}

void main()
    .catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    })
    .finally(() => {
        void getAppDatabase().then((db) => db.destroy());
    });
