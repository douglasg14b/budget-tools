# Budget Tools web SPA: Vite build, served by nginx.
#
# Build context is the REPO ROOT (see docker-compose-prod.yml). The web app imports
# `@budget-tools/web-sdk`, a workspace package, so the whole workspace plus the root lockfile is
# needed for a frozen install.
FROM node:22-slim AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable pnpm

WORKDIR /app
COPY . .

# `--ignore-scripts` skips the root `prepare` (lefthook git-hook install), which fails in an image
# with neither git nor .git.
RUN pnpm install --frozen-lockfile --prefer-offline --ignore-scripts

# The generated SDK (packages/web-sdk/src/gen) and the OpenAPI spec are both committed, so no
# tsoa run is needed here. The build also typechecks (`tsc --noEmit && vite build`), and the
# scanic Vite plugin copies the ONNX Runtime assets into dist/scanic-ml.
RUN pnpm --filter @budget-tools/web build

FROM nginx:1.27-alpine AS runner

# openssl for the self-signed certificate the entrypoint generates at boot.
RUN apk add --no-cache openssl

# Replace the stock config: the default server block would shadow ours on port 80 and serve the
# nginx welcome page instead of the SPA.
RUN rm /etc/nginx/conf.d/default.conf
COPY apps/web/nginx.conf /etc/nginx/conf.d/budget-tools.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

COPY docker/generate-self-signed-cert.sh /usr/local/bin/generate-self-signed-cert.sh
# Normalise CRLF: this repo is developed on Windows, and a \r in the shebang line makes the
# kernel look for an interpreter named "/bin/sh\r" and fail with a bare "not found".
RUN sed -i 's/\r$//' /usr/local/bin/generate-self-signed-cert.sh \
    && chmod +x /usr/local/bin/generate-self-signed-cert.sh

ENV TLS_CERT_HOSTS="DNS:localhost,DNS:web,DNS:budget.moochermedia.co,IP:127.0.0.1"

EXPOSE 8443

ENTRYPOINT ["/usr/local/bin/generate-self-signed-cert.sh"]
CMD ["nginx", "-g", "daemon off;"]
