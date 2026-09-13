# Budget Tools API (Express + tsoa).
#
# Build context is the REPO ROOT (see docker-compose-prod.yml): this is a pnpm workspace and the
# API depends on `@budget-tools/db`, so the whole workspace plus the single root lockfile must be
# present for a frozen install to resolve.
#
# Debian slim rather than Alpine: `sharp` ships prebuilt glibc binaries, and the musl path pulls
# in a source build. Node 22 matches the other images in the stack.
FROM node:22-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable pnpm

# ---------------------------------------------------------------------------------------------
# Builder: full workspace install (devDependencies included, since tsoa codegen needs them),
# then `pnpm deploy` prunes to just the API's production tree.
# ---------------------------------------------------------------------------------------------
FROM base AS builder
WORKDIR /app

COPY . .

# NOTE: sharp's musl libvips variant (~19MB) also lands here and can never load on this glibc
# base. `pnpm config set supportedArchitectures.*` does not remove it: the lockfile pins both
# variants and `--frozen-lockfile` rightly wins. Dropping it would mean unfreezing the lockfile
# or pinning libc in the committed package.json (which would break Windows/macOS dev installs) —
# not worth it for 19MB.
#
# `--ignore-scripts` skips the root `prepare` (lefthook git-hook install), which fails in an image
# with neither git nor .git. `sharp` ships prebuilt linux-x64 glibc binaries, so it needs no
# postinstall build on this base — which is also why this image is Debian, not Alpine.
RUN pnpm install --frozen-lockfile --prefer-offline --ignore-scripts

# tsoa generates src/generated/routes.ts, which server.ts imports at runtime. The OpenAPI spec is
# committed, but the route bindings are not, so they must be produced here — before the prune,
# while tsoa's own devDependency tree is still present.
RUN pnpm --filter @budget-tools/api exec tsoa spec-and-routes

# Produces a self-contained /deploy: the API's own source plus only its production dependencies,
# with workspace deps (@budget-tools/db) vendored in as real directories rather than symlinks
# pointing outside the tree. This is what drops the runtime image from ~980MB to ~250MB — the
# full workspace install drags in the web app's icon packs, Biome, PGlite, and the bundler, none
# of which the API runs.
# `--ignore-scripts` again for the root `prepare`/lefthook; esbuild (tsx's engine) ships a
# prebuilt linux-x64 binary, so skipping its optional build script is safe here.
RUN pnpm deploy --filter @budget-tools/api --prod --ignore-scripts /deploy

# ---------------------------------------------------------------------------------------------
# Runner: just Node plus the pruned tree. No pnpm store, no workspace, no build toolchain.
# ---------------------------------------------------------------------------------------------
FROM base AS runner
WORKDIR /app

COPY --from=builder /deploy ./

# The deployed tsconfig.json still `extends` @budget-tools/config-typescript, a devDependency that
# --prod correctly pruned. A failed extends is silent and would drop `experimentalDecorators`,
# which tsoa's parameter decorators require — so replace it with the self-contained runtime
# config. (Typechecking in CI still uses the original.)
COPY apps/api/tsconfig.runtime.json ./tsconfig.json

ENV NODE_ENV=production
ENV API_PORT=4020
ENV API_LISTEN_HOST=0.0.0.0
EXPOSE 4020

# No compile step — tsx runs the TypeScript directly, the same convention the
# transactions-retrieval service uses. tsx is a real dependency of the API for this reason.
CMD ["./node_modules/.bin/tsx", "src/server.ts"]
