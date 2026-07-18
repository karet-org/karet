# syntax=docker/dockerfile:1.6

# Debian (glibc) base: the `duckdb` native addon ships prebuilt binaries for
# linux glibc, so this avoids the from-source compile that Alpine/musl forces.
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
# duckdb is externalized, so it isn't traced into the standalone bundle. Its
# node-pre-gyp loader also pulls several transitive runtime deps; copying the
# full node_modules is the reliable way to satisfy them (Next merges it with
# the traced standalone node_modules).
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV HOME=/home/nextjs

CMD ["node", "server.js"]
