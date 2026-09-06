# karet

[![CI](https://github.com/karet-org/karet/actions/workflows/ci.yml/badge.svg)](https://github.com/karet-org/karet/actions/workflows/ci.yml)
[![Publish Docker image](https://github.com/karet-org/karet/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/karet-org/karet/actions/workflows/docker-publish.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-2b2c33)](./LICENSE)

Next.js frontend for the Karet analytics platform. Renders
configurable dashboards and the React Flow Data Flow Graph editor over an
ETL pipeline configuration stored in S3.

See the top-level `compose.yml` for the full stack (rustfs +
worker + web).

## Features

- Pipeline templates: `Blank` and `Spending Tracker` (worked example
  with merchant + category lookups, vertical monthly-spending bar, and
  a `where` clause excluding bank-internal rows). See
  `lib/templates/index.ts` and the docs guide.
- Dashboards with KPI, doughnut, line, bar (horizontal Top-N or
  vertical date-binned), table, map, and Sankey panels. Click a
  doughnut, bar, choropleth, or Sankey node to cross-filter the rest
  of the dashboard.
- Optional `where: AstNode[]` on a dashboard applies a baseline row
  filter before any panel renders or any dropdown populates.
- Graph editor for source containers, lookups, mappings, and analytic
  tables. Mapping column expressions support a textual form that
  round-trips losslessly via `astExpression`.

## Environment variables

| Variable | Description |
|----------|-------------|
| `S3_BUCKET_PIPELINES` | Bucket for ELT configs, dashboards, job records, and auth (default `karet-pipelines`). |
| `S3_BUCKET_LAKE` | Bucket for raw CSV data (default `karet-lake`). |
| `S3_BUCKET_WAREHOUSE` | Bucket for query-ready partitioned Parquet output (default `karet-warehouse`). |
| `AWS_ENDPOINT_URL` | S3 endpoint URL (e.g. `http://rustfs:9000` for local dev, `https://s3.<region>.amazonaws.com` for real AWS). |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` | S3 credentials |
| `KARET_SESSION_SECRET` | **Required.** HMAC key used to sign user session cookies. Generate with `openssl rand -base64 48`. |
| `KARET_ADMIN_PASSWORD_HASH` | **Required.** scrypt hash of the admin password. Generate with `npm run hash-password`, which prints both the plain value and the Docker-Compose-escaped form (compose `.env` files interpolate `$`, so each `$` must be doubled there). Changing the password = regenerate + restart. |
| `KARET_WORKER_TOKEN` | **Required.** Shared bearer token sent on worker `POST /config/validate` calls; must match the worker's value. Generate with `openssl rand -hex 32`. |
| `REDIS_URL` | **Required.** Valkey/Redis connection string (e.g. `redis://valkey:6379`). Jobs are enqueued onto the stream consumed by the worker fleet; the jobs page merges live queue state + progress over S3 history. See `karet-jobs-redis-design.html`. |
| `DUCKDB_MEMORY_LIMIT` | Optional memory cap for the server-side DuckDB session (default `512MB`). |
| `S3_CONSOLE_URL` | If set, the UI shows a Settings &rarr; S3 console link. Empty hides the link. |
| `PORT` | Dev server port (default `3000`) |

Authentication is single-admin, password-only. The credential is
provisioned via `KARET_ADMIN_PASSWORD_HASH` — there is no in-app setup
or password-change flow, so a wiped bucket can never revert the
instance to an unauthenticated state.

## Development

```sh
npm install
npm run dev                   # http://localhost:3000
npm test                      # vitest + fast-check property tests
npm run typecheck
npm run test:e2e              # Playwright, requires the full stack running
```

## Pages

| Route | Purpose |
|-------|---------|
| `/` | Pipeline list + create/import |
| `/p/[pipeline]/graph` | Data Flow Graph editor |
| `/p/[pipeline]/data` | SQL over warehouse tables (server-side DuckDB) + saved queries |
| `/p/[pipeline]/jobs` | Job history + trigger |
| `/p/[pipeline]/dashboards/[name]` | Configurable dashboard |

## S3 event notifications (webhook-triggered runs)

The webhook target in `compose.yml` is only half of the wiring: RustFS
also needs a **bucket notification rule** on the lake bucket, which must
be applied once after the buckets are created:

```sh
aws --endpoint-url http://localhost:9000 s3api put-bucket-notification-configuration \
  --bucket karet-lake --notification-configuration '{
  "QueueConfigurations": [{
    "Id": "karet-worker-webhook",
    "QueueArn": "arn:rustfs:sqs:us-east-1:primary:webhook",
    "Events": ["s3:ObjectCreated:*"],
    "Filter": {"Key": {"FilterRules": [
      {"Name": "prefix", "Value": "pipelines/"},
      {"Name": "suffix", "Value": ".csv"}
    ]}}
  }]}'
```

Without this rule, CSV uploads never trigger pipeline runs (manual runs
still work). RustFS also requires the webhook origin to be allow-listed
via `RUSTFS_OUTBOUND_ALLOW_ORIGINS` (set in `compose.yml`) and answers a
`HEAD /` health probe against the worker before delivering.
