
-- Create tables if they don't exist
CREATE TABLE IF NOT EXISTS tracking (
    id SERIAL PRIMARY KEY,
    last_pulled_date TIMESTAMPTZ,
    last_server_knowledge NUMERIC,
    cache_budget JSONB
);

CREATE TABLE IF NOT EXISTS transactions (
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

CREATE TABLE IF NOT EXISTS category_groups (
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    hidden BOOLEAN NOT NULL,
    deleted BOOLEAN NOT NULL,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS categories (
    id TEXT NOT NULL,
    category_group_id TEXT NOT NULL,
    name TEXT NOT NULL,
    hidden BOOLEAN NOT NULL,
    deleted BOOLEAN NOT NULL,
    note TEXT,
    PRIMARY KEY (id),
    FOREIGN KEY (category_group_id) REFERENCES category_groups(id)
);

-- Create indexes for transactions
CREATE INDEX IF NOT EXISTS idx_ynab_date ON transactions (date);
CREATE INDEX IF NOT EXISTS idx_ynab_cleared ON transactions (cleared);
CREATE INDEX IF NOT EXISTS idx_ynab_approved ON transactions (approved);
CREATE INDEX IF NOT EXISTS idx_transaction_account_name ON transactions (account_name);
CREATE INDEX IF NOT EXISTS idx_transaction_payee_name ON transactions (payee_name);
CREATE INDEX IF NOT EXISTS idx_transaction_category_name ON transactions (category_name);

-- Create indexes for categories
CREATE INDEX IF NOT EXISTS idx_category_group_id ON categories (category_group_id);
CREATE INDEX IF NOT EXISTS idx_category_hidden ON categories (hidden);
CREATE INDEX IF NOT EXISTS idx_category_deleted ON categories (deleted);
CREATE INDEX IF NOT EXISTS idx_category_name ON categories (name);

-- Create indexes for category groups
CREATE INDEX IF NOT EXISTS idx_category_group_hidden ON category_groups (hidden);
CREATE INDEX IF NOT EXISTS idx_category_group_deleted ON category_groups (deleted);
CREATE INDEX IF NOT EXISTS idx_category_group_name ON category_groups (name);