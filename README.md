# budget-tools

## Tests

`.env.local` points at production: the Postgres database, S3, YNAB. Tests never load it.

- `pnpm test` runs Vitest with the committed, secret-free `.env.test`. Postgres is in-process PGlite (`createTestAppDatabase` in `apps/api`).
- A Vitest setup file (`vitest.setup.ts` in each app, from `@budget-tools/shared-node`) runs before every test file. It deletes remote-pointing variables (`DB_CONNECTION_STRING`, `*_S3_*`, `YNAB_API_KEY`, `OPENROUTER_API_KEY`, and the rest) and makes any connection to a non-loopback host throw. This holds even if the shell exports them, or the run is wrapped in `dotenvx run -f .env.local`.
- Every real Postgres factory (`createDatabase`, `createAppDatabase`, `getDbConnectionString`) throws under Vitest.
- `apps/api/src/__tests__/testSafety.test.ts` proves each guard. It also fails if any default test script mentions `.env.local` or `dotenvx`.
- `pnpm --filter @budget-tools/api test:live` is the one explicit exception. It runs only `*.live.test.ts`, with `.env.local` loaded. Only the OpenRouter key and `openrouter.ai` get through; the database and everything else stay blocked.

## Amazon order data

Payment/order history is scraped by a local Playwright MCP, not a workspace package.

1. Copy `.env.local.example` to `.env.local` and fill in secrets.
2. Run `pnpm setup:amazon-mcp`. That clones the MCP into gitignored `third_party/amazon-order-history-csv-download-mcp/`, pins the commit this repo tests against, and applies `third_party/patches/amazon-mcp-multi-item.patch` so every invoice line item is stored. Other clones of this repo get the same scraper by running that command; a fork of the MCP is not required.
3. Start the API and `POST /api/amazon-orders/sync` with `{ "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" }`. The first call opens headed Chromium for Amazon login; later calls reuse that session.

How Classify uses the cache vs Sync (including old dates and Your Payments pagination) is in [docs/amazon-classify-sync.md](docs/amazon-classify-sync.md).

`pnpm clear:amazon-cache` deletes stored Amazon orders, line items, and split suggestions. Payments and login stay. Sync Amazon again to re-scrape order pages.
