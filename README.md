# budget-tools

## Amazon order data

Payment/order history is scraped by a local Playwright MCP, not a workspace package.

1. Copy `.env.local.example` to `.env.local` and fill in secrets.
2. Run `pnpm setup:amazon-mcp`. That clones the MCP into gitignored `third_party/amazon-order-history-csv-download-mcp/`, pins the commit this repo tests against, and applies `third_party/patches/amazon-mcp-multi-item.patch` so every invoice line item is stored. Other clones of this repo get the same scraper by running that command; a fork of the MCP is not required.
3. Start the API and `POST /api/amazon-orders/sync` with `{ "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" }`. The first call opens headed Chromium for Amazon login; later calls reuse that session.

`pnpm clear:amazon-cache` deletes stored Amazon orders, line items, and split suggestions. Payments and login stay. Sync Amazon again to re-scrape order pages.
