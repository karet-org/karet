# karet

[![CI](https://github.com/karet-org/karet/actions/workflows/ci.yml/badge.svg)](https://github.com/karet-org/karet/actions/workflows/ci.yml)
[![Publish Docker image](https://github.com/karet-org/karet/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/karet-org/karet/actions/workflows/docker-publish.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-2b2c33)](./LICENSE)

Web app for Karet, a self-hosted analytics stack: ETL pipelines you draw as a
graph, and dashboards you describe in YAML. This repo holds the Next.js app, the
graph editor and the compose file for the whole stack. The pipeline runner lives
in [karet-worker](https://github.com/karet-org/karet-worker).

Docs: [karet-docs.pages.dev](https://karet-docs.pages.dev)

## Features

- **Pipeline visualization.** The graph is the editor: sources, lookups, mappings
  and tables are nodes, and dragging between them says what feeds what.
- **Config-driven dashboards.** A dashboard is a YAML document; panels are DuckDB
  queries over the warehouse, and clicking a chart filters the rest.
- **Pipeline versioning.** Every save is a numbered version with an author and a
  diff against what is live. Runs are pinned to the version that produced them.
- **Accounts and per-pipeline access.** Instance roles are viewer, editor and
  admin, and a pipeline can be limited to the people invited to it.

## Environment variables

The app refuses to start if a required variable is missing; see
`lib/config/required-env.ts`.

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | *(required)* | Postgres connection string. Holds accounts, pipelines, config versions, job history and access. |
| `REDIS_URL` | *(required)* | Valkey connection string. Jobs are enqueued onto the stream the worker consumes. |
| `S3_BUCKET_PIPELINES` | *(required)* | Bucket for dashboards and saved queries. |
| `S3_BUCKET_LAKE` | *(required)* | Bucket for uploaded source files. |
| `S3_BUCKET_WAREHOUSE` | *(required)* | Bucket for the Parquet tables runs write. |
| `AWS_ENDPOINT_URL` | *(required)* | S3 endpoint, `http://rustfs:9000` locally. |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` | *(required)* | S3 credentials. |
| `KARET_SESSION_SECRET` | *(required)* | Signs session cookies. `openssl rand -base64 48`. |
| `KARET_ADMIN_PASSWORD_HASH` | *(required)* | scrypt hash of the bootstrap admin's password, re-asserted on every start. `npm run hash-password` prints it, and the compose-escaped form. |
| `KARET_WORKER_TOKEN` | *(required)* | Bearer token this app sends to the worker; must match the worker's. `openssl rand -hex 32`. |
| `KARET_ADMIN_USERNAME` | `admin` | Username of that bootstrap admin. |
| `KARET_PUBLIC_URL` | `http://localhost:3000` | The URL people reach this instance on. An `https:` value turns on secure cookies. |
| `S3_FORCE_PATH_STYLE` | unset | `true` for S3 implementations without virtual-host addressing, RustFS included. |
| `PIPELINES_PREFIX` | `pipelines/` | Key prefix for per-pipeline objects in the lake and pipelines buckets. |
| `WORKER_URL` | `http://worker:8080` | Where to reach the worker for config validation. |
| `DUCKDB_MEMORY_LIMIT` | `512MB` | Memory cap for the server-side DuckDB session. |
| `DUCKDB_THREADS` | `2` | Thread cap for that session. |
| `DATABASE_POOL_MAX` | `8` app, `4` auth | Cap per connection pool: the app's queries and better-auth keep separate pools. |
| `PORT` | `3000` | Port to serve on. |

Accounts live in Postgres and admins manage them in Settings. The bootstrap admin
comes from the environment, so a lost database cannot leave the instance with no
way in; see the
[authentication guide](https://karet-docs.pages.dev/guide/authentication).

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
| `/p/[pipeline]/history` | Config versions, diffs and restores |
| `/p/[pipeline]/access` | Who may use this pipeline |
| `/settings` | Your account, the workspace name, and accounts |

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
