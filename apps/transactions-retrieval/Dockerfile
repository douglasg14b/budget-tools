FROM node:20-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable pnpm
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

FROM base AS builder

WORKDIR /app
COPY . .

# Install deps
FROM base AS installer
WORKDIR /app

COPY --from=builder /app/ .
# COPY --from=builder /app/.npmrc .
# COPY --from=builder /app/out/json/ .
# COPY --from=builder /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
# COPY --from=builder /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml

RUN pnpm install --ignore-scripts

# Build the project
COPY --from=builder /app/ .
# RUN pnpm run build --parallel --filter @ivr3/ivr3-api

# Run the project
# We go from installer instead of base because this project is really just meant to execute pnpm commands
# So we need pnpm and deps to be installed
FROM installer AS runner
WORKDIR /app

CMD ["sleep", "infinity"]
# CMD [ "cron", "-f" ]