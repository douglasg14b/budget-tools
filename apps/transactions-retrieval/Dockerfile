FROM node:20-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable pnpm
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

FROM base AS builder

WORKDIR /app
COPY . .

# We go from installer instead of base because this project is really just meant to execute pnpm commands
# So we need pnpm and deps to be installed in the actual final image
FROM base AS runner
WORKDIR /app

COPY --from=builder /app/ .
RUN pnpm install --frozen-lockfile --prefer-offline

CMD ["sleep", "infinity"]