
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