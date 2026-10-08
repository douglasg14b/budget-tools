/**
 * Throws when called inside a Vitest run. `.env.local` is the production database, so every
 * path that opens a real Postgres connection calls this first; tests use PGlite instead
 * (`createTestAppDatabase` in apps/api).
 */
export function assertNotInTestRun(action: string): void {
    if (process.env.VITEST) {
        throw new Error(
            `Refusing to ${action} inside a test run. Tests must never touch a real database; ` +
                'use the PGlite test database (createTestAppDatabase) instead.',
        );
    }
}
