
CREATE DATABASE budget_tools;
CREATE USER budget_tools_user WITH PASSWORD '123456';
ALTER DATABASE budget_tools OWNER TO budget_tools_user;
GRANT ALL PRIVILEGES ON DATABASE budget_tools TO budget_tools_user;

\c budget_tools -- Connect to the budget_tools database

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO budget_tools_user;
-- Grant usage and update privileges on all sequences
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO budget_tools_user;

-- Step 6: Ensure future tables automatically grant privileges to the user
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO budget_tools_user;


CREATE TABLE tracking (
    id SERIAL PRIMARY KEY,
    last_pulled_date TIMESTAMPTZ,
    last_server_knowledge NUMERIC,
    cache_budget JSONB
);

CREATE TABLE transactions (
    id TEXT NOT NULL,
    date DATE NOT NULL,
    amount INTEGER NOT NULL,
    memo TEXT,
    cleared TEXT NOT NULL,
    approved BOOLEAN NOT NULL,
    flag_color TEXT,
    flag_name TEXT,
    account_id TEXT NOT NULL,
    payee_id TEXT,
    category_id TEXT,
    transfer_account_id TEXT,
    transfer_transaction_id TEXT,
    matched_transaction_id TEXT,
    import_id TEXT,
    import_payee_name TEXT,
    import_payee_name_original TEXT,
    debt_transaction_type TEXT,
    deleted BOOLEAN NOT NULL,
    account_name TEXT NOT NULL,
    payee_name TEXT,
    category_name TEXT,
    subtransactions JSONB NOT NULL,
    meta JSONB NOT NULL,
    PRIMARY KEY (id)
);

-- Create indexes
CREATE INDEX idx_ynab_date ON transactions (date);
CREATE INDEX idx_ynab_cleared ON transactions (cleared);
CREATE INDEX idx_ynab_approved ON transactions (approved);