# syntax=docker/dockerfile:1.6

# Debian (glibc) base: @duckdb/node-bindings ships prebuilt linux-gnu binaries.
FROM node:20-bookworm-slim AS base

# Build the pages into dist/client and the server into dist/server.
FROM base AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Only what the server imports at run time. The page libraries are bundled
# into dist/client, so they are dev dependencies.
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Give the runtime user a real home so DuckDB can install/cache its httpfs
# extension there.
RUN addgroup --system --gid 1001 karet && \
    adduser --system --uid 1001 --home /home/karet karet && \
    mkdir -p /home/karet/.duckdb/extensions && \
    chown -R karet:karet /home/karet

COPY --from=deps --chown=karet:karet /app/node_modules ./node_modules
COPY --from=builder --chown=karet:karet /app/package.json ./package.json
COPY --from=builder --chown=karet:karet /app/dist ./dist
# `db-setup.mjs` applies `migrations/` under an advisory lock before the server
# starts. `manage-users.mjs` can be run with `docker compose run`.
COPY --from=builder --chown=karet:karet /app/scripts ./scripts
COPY --from=builder --chown=karet:karet /app/migrations ./migrations

USER karet

EXPOSE 3000

ENV PORT=3000
ENV HOME=/home/karet

# Migrate, then serve. Several containers starting together is safe: the lock in
# `db-setup.mjs` means the others wait and find nothing to do.
CMD ["sh", "-c", "node scripts/db-setup.mjs && exec node dist/server/index.js"]
