/**
 * Auth table types. Column names are camelCase here and snake_case in Postgres; the app client's
 * `CamelCasePlugin` bridges the two (see `data-persistence/database.ts`).
 */

export type UsersTable = {
    id: string;
    username: string;
    /** PHC-format argon2id string. Never leaves the API. */
    passwordHash: string;
    createdAt: Date;
    updatedAt: Date;
};

export type SessionsTable = {
    id: string;
    userId: string;
    /** SHA-256 of the opaque cookie token. The raw token is never stored. */
    tokenHash: string;
    createdAt: Date;
    expiresAt: Date;
    lastUsedAt: Date;
};
