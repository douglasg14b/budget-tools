-- Budget Tools Postgres role bootstrap.
--
-- This is a ONE-TIME provisioning step, deliberately kept OUT of the Kysely migrations
-- (see the plan's decision D3): creating a role is not cleanly idempotent per-app and would
-- force the migrator to run with elevated privileges. Run this once, as a superuser, against
-- a freshly-created `budget_tools` database before the migrator runs. It replaces the
-- role/grant portion of the retired `apps/transactions-retrieval/src/data/scaffold.sql`.
--
-- Set the password to a real secret for the target environment before running (do not commit
-- a real password). Locally the dev Postgres already provisions this role via
-- init/docker_postgres_init.sql-style setup, so this is primarily for the managed prod DB.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'budget_tools_user') THEN
        -- Replace 'CHANGE_ME' with the real password for this environment.
        CREATE USER budget_tools_user WITH PASSWORD 'CHANGE_ME';
    END IF;
END
$$;

GRANT ALL PRIVILEGES ON DATABASE budget_tools TO budget_tools_user;

-- The following grants apply to objects in the `public` schema of the CURRENT database, so
-- run this script while connected to `budget_tools`.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO budget_tools_user;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO budget_tools_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO budget_tools_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO budget_tools_user;
