# Budget Tools transactions retriever.
#
# The container idles; Coolify triggers the actual pull on a cron. See the CMD note at the bottom
# for the exact command — it is NOT a pnpm script.
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

# Idles until the scheduler runs the retrieval.
#
# THE CRON COMMAND IS:
#   ./node_modules/.bin/tsx ./src/main.ts
#
# It MUST run with /app as the working directory. tsconfig maps the `@/*` alias that the source
# imports through (`@/data`, `@/services/...`) to `src/*` relative to cwd, so invoking it by
# absolute path from elsewhere fails with ERR_MODULE_NOT_FOUND on '@/data'. WORKDIR is /app, so a
# plain `docker exec <container> ./node_modules/.bin/tsx ./src/main.ts` is already correct; only
# add `sh -c 'cd /app && …'` if the scheduler overrides the working directory.
#
# Not a pnpm script. `pnpm deploy --prod` prunes this image to a standalone package tree, so /app
# is the package root itself — there is no `apps/transactions-retrieval/` path and no workspace.
# Anything of the form `pnpm run:prod` / `pnpm pull-transactions` fails before running any code:
# pnpm re-resolves the dependency tree, hits the `workspace:` protocol on @budget-tools/db, and
# dies with "Cannot resolve package from workspace because workspace packages were not loaded".
CMD ["sleep", "infinity"]
