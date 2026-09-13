# Budget Tools transactions retriever.
#
# The container idles; Coolify triggers the actual pull on a cron with
# `pnpm --filter @budget-tools/transactions-retrieval run:prod`.
#
# Build context is the REPO ROOT: single root lockfile, pnpm workspace.
FROM node:22-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable pnpm

# ---------------------------------------------------------------------------------------------
# Builder: full workspace install, then prune to this package's production tree.
# ---------------------------------------------------------------------------------------------
FROM base AS builder
WORKDIR /app

COPY . .

# `--ignore-scripts` skips the root `prepare` (lefthook git-hook install), which fails in an
# image that has neither git nor .git (both are excluded by .dockerignore).
RUN pnpm install --frozen-lockfile --prefer-offline --ignore-scripts

RUN pnpm deploy --filter @budget-tools/transactions-retrieval --prod --ignore-scripts /deploy

# ---------------------------------------------------------------------------------------------
# Runner: Node plus the pruned tree.
# ---------------------------------------------------------------------------------------------
FROM base AS runner
WORKDIR /app

COPY --from=builder /deploy ./

# The deployed tsconfig.json still `extends` @budget-tools/config-typescript, a devDependency the
# prune correctly dropped. A failed extends is silent and loses the `@/*` path alias the source
# imports through, so replace it with the self-contained runtime config.
COPY apps/transactions-retrieval/tsconfig.runtime.json ./tsconfig.json

ENV NODE_ENV=production

# Idles until the scheduler execs the retrieval run. NOTE: the pruned tree is no longer a pnpm
# workspace, so the old cron command (`pnpm --filter … run:prod`) no longer resolves. Invoke
# the binary directly instead:
#   docker exec transactions-retrieval ./node_modules/.bin/tsx ./src/main.ts
CMD ["sleep", "infinity"]
