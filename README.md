# karet

Next.js frontend for the Karet analytics platform. Renders
configurable dashboards and the React Flow Data Flow Graph editor over an
ETL pipeline configuration stored in S3.

See the top-level `docker-compose.yaml` for the full stack (rustfs +
worker + web).

## Environment variables

| Variable | Description |
|----------|-------------|
| `S3_BUCKET` | S3 bucket name |
| `AWS_ENDPOINT_URL` | S3 endpoint URL (e.g. `http://rustfs:9000` for local dev, `https://s3.<region>.amazonaws.com` for real AWS). |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` | S3 credentials |
| `KARET_SESSION_SECRET` | **Required.** HMAC key used to sign user session cookies. Generate with `openssl rand -base64 48`. |
| `KARET_WEBHOOK_SECRET` | Optional shared secret for `/api/events/s3` (RustFS webhooks). Empty disables it. |
| `NEXT_PUBLIC_S3_CONSOLE_URL` | If set, the UI shows a Settings &rarr; S3 console link. Empty hides the link. |
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
| `/p/[pipeline]/tables` | SQL over analytic tables (in-browser AlaSQL) |
| `/p/[pipeline]/jobs` | Job history + trigger |
| `/p/[pipeline]/dashboards/[name]` | Configurable dashboard |
