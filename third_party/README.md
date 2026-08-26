# Amazon order MCP (local clone)

Amazon payment/order history is scraped by a headed Playwright MCP that is **not** a pnpm workspace package.

`pnpm setup:amazon-mcp` clones that server into `amazon-order-history-csv-download-mcp/` (gitignored), checks out the pinned commit, applies `third_party/patches/amazon-mcp-multi-item.patch` (every line item in a `purchasedItems` wrapper, plus invoice totals), builds it, installs Chromium, and sets `AMAZON_ORDERS_MCP_ENTRY` in `.env.local` to this directory's `dist/index.js`.

The patch file is versioned in this repo, so every installer who runs setup gets the same invoice extraction. Forking the MCP is not required.
