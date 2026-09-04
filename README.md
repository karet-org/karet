# karet

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
| `KARET_WORKER_TOKEN` | **Required.** Shared bearer token sent on worker `POST /jobs/run` calls; must match the worker's value. Generate with `openssl rand -hex 32`. |
| `REDIS_URL` | Optional (e.g. `redis://redis:6379`). When set, jobs are enqueued onto the Redis stream consumed by the worker fleet instead of calling the worker over HTTP, and the jobs page shows live queue state + progress. See `karet-jobs-redis-design.html`. |
| `DUCKDB_MEMORY_LIMIT` | Optional memory cap for the server-side DuckDB session (default `512MB`). |
| `KARET_WEBHOOK_SECRET` | Optional shared secret for `/api/events/s3` (RustFS webhooks). Empty disables it. |
| `S3_CONSOLE_URL` | If set, the UI shows a Settings &rarr; S3 console link. Empty hides the link. |
| `PORT` | Dev server port (default `3000`) |

The first request to `/login` shows a "Set admin password" form when no
admin exists yet (`_auth/admin.json` missing in the bucket); after that,
it renders the standard sign-in form.

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
