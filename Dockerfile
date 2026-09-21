# syntax=docker/dockerfile:1.6

# Debian (glibc) base: @duckdb/node-bindings ships prebuilt linux-gnu binaries.
FROM node:20-bookworm-slim AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Build the application (Next.js 15 standalone output)
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Give the runtime user a real home so DuckDB can install/cache its httpfs
# extension there.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --home /home/nextjs nextjs && \
    mkdir -p /home/nextjs/.duckdb/extensions && \
    chown -R nextjs:nodejs /home/nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# @duckdb/node-api is externalized, so it isn't traced into the standalone
# bundle; copying node_modules satisfies it (Next merges with the traced set).
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
# Schema work runs from the image, not from a checkout: `db-setup.mjs` applies
# `migrations/` under an advisory lock, and the operational scripts (the S3
# import, manifest adoption, account management) are runnable with
# `docker compose run`.
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/migrations ./migrations

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV HOME=/home/nextjs

# Migrate, then serve. Several containers starting together is safe: the lock in
# `db-setup.mjs` means the others wait and find nothing to do.
CMD ["sh", "-c", "node scripts/db-setup.mjs && exec node server.js"]
