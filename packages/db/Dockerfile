# One-shot Postgres migrator for the shared Budget Tools database.
#
# Runs to completion and exits; `api`, `scorer`, and `transactions-retrieval` wait on its success
# (see docker-compose-prod.yml). Exactly one service owns schema, so the apps never migrate on
# boot and two replicas can never race each other.
#
# Build context is the REPO ROOT: single root lockfile, pnpm workspace.
FROM node:22-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable pnpm

# ---------------------------------------------------------------------------------------------
# Builder: full workspace install, then prune to just this package's production tree.
# ---------------------------------------------------------------------------------------------
FROM base AS builder
WORKDIR /app

COPY . .

# `--ignore-scripts` skips the root `prepare` (lefthook git-hook install), which fails in an
# image that has neither git nor .git.
RUN pnpm install --frozen-lockfile --prefer-offline --ignore-scripts

# Without this prune the image carries the entire workspace — the web app's icon packs, Biome,
# PGlite, the bundler — none of which a migration run touches.
RUN pnpm deploy --filter @budget-tools/db --prod --ignore-scripts /deploy

# ---------------------------------------------------------------------------------------------
# Runner: Node plus the pruned tree.
# ---------------------------------------------------------------------------------------------
FROM base AS runner
WORKDIR /app

COPY --from=builder /deploy ./

ENV NODE_ENV=production

# Exits non-zero on failure, which is what `condition: service_completed_successfully` keys off.
CMD ["./node_modules/.bin/tsx", "src/runMigrations.ts"]
