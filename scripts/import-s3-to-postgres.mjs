#!/usr/bin/env node
// Import pipelines, config history and job records from S3 into Postgres.
//
// One-off, idempotent, and safe to run against a live instance: it only inserts
// what is missing. Nothing in S3 is deleted — verify the import, then remove the
// old objects yourself.
//
//   DRY_RUN=1 node scripts/import-s3-to-postgres.mjs     # report only
//   node scripts/import-s3-to-postgres.mjs               # every pipeline
//   node scripts/import-s3-to-postgres.mjs <slug> ...    # named pipelines
//
// What moves: pipeline.json becomes a config version (with `_history/*.json`
// folded in ahead of it where present), and `jobs/*.json` become job rows. What
// stays: dashboards, saved queries, lake files, warehouse Parquet and table
// manifests.

import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import pg from "pg";

const PIPELINES_BUCKET = process.env.S3_BUCKET_PIPELINES || "karet-pipelines";
const PREFIX = process.env.PIPELINES_PREFIX || "pipelines/";
const DRY_RUN = process.env.DRY_RUN === "1";

const s3 = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  endpoint: process.env.AWS_ENDPOINT_URL || undefined,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
});

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const db = new pg.Client({ connectionString: url });

async function listKeys(prefix) {
  const keys = [];
  let token;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: PIPELINES_BUCKET,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const o of res.Contents ?? []) keys.push({ key: o.Key, modified: o.LastModified });
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

async function getJson(key) {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: PIPELINES_BUCKET, Key: key }));
    return JSON.parse(await res.Body.transformToString());
  } catch {
    return null;
  }
}

async function listSlugs() {
  const res = await s3.send(
    new ListObjectsV2Command({ Bucket: PIPELINES_BUCKET, Prefix: PREFIX, Delimiter: "/" }),
  );
  return (res.CommonPrefixes ?? [])
    .map((p) => p.Prefix.slice(PREFIX.length).replace(/\/$/, ""))
    .filter(Boolean);
}

/** Insert a config version, returning its id, or null when one already exists. */
async function insertVersion(slug, version, config, author, note, createdAt) {
  const existing = await db.query(
    "SELECT id FROM config_versions WHERE pipeline = $1 AND version = $2",
    [slug, version],
  );
  if (existing.rowCount > 0) return existing.rows[0].id;
  const { rows } = await db.query(
    `INSERT INTO config_versions (pipeline, version, config, author_name, note, created_at)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, now()))
     RETURNING id`,
    [slug, version, JSON.stringify(config), author, note, createdAt],
  );
  return rows[0].id;
}

async function importPipeline(slug) {
  const base = `${PREFIX}${slug}/`;
  const config = await getJson(`${base}pipeline.json`);
  if (!config) return { slug, skipped: "no pipeline.json" };

  const already = await db.query("SELECT 1 FROM pipelines WHERE slug = $1", [slug]);
  const name = config.name?.trim() || slug;

  // History first, so version numbers keep their original order and the live
  // config lands on top as the newest.
  const historyKeys = (await listKeys(`${base}_history/`))
    .filter((o) => o.key.endsWith(".json"))
    .map((o) => ({ ...o, n: Number(o.key.slice(`${base}_history/`.length, -".json".length)) }))
    .filter((o) => Number.isInteger(o.n))
    .sort((a, b) => a.n - b.n);

  const jobKeys = (await listKeys(`${base}jobs/`)).filter((o) => o.key.endsWith(".json"));

  if (DRY_RUN) {
    return {
      slug,
      plan: `${already.rowCount ? "exists" : "register"}, ${historyKeys.length} history + 1 live version, ${jobKeys.length} job(s)`,
    };
  }

  await db.query(
    `INSERT INTO pipelines (slug, name) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING`,
    [slug, name],
  );

  let version = 0;
  let lastId = null;
  for (const entry of historyKeys) {
    const historical = await getJson(entry.key);
    if (!historical?.config) continue;
    version += 1;
    lastId = await insertVersion(
      slug,
      version,
      historical.config,
      historical.author ?? "imported",
      historical.note ?? null,
      historical.saved_at ?? null,
    );
  }

  version += 1;
  lastId = await insertVersion(slug, version, config, "imported", "imported from S3", null);

  await db.query(
    `INSERT INTO pipelines_current (pipeline, config_version_id) VALUES ($1, $2)
     ON CONFLICT (pipeline) DO UPDATE SET config_version_id = $2, updated_at = now()`,
    [slug, lastId],
  );

  // Job records are flat JSON with the right fields already, so this is a
  // read-and-insert loop rather than a transformation.
  let jobs = 0;
  for (const entry of jobKeys) {
    const record = await getJson(entry.key);
    if (!record?.id) continue;
    const status = ["queued", "running", "completed", "failed", "cancelled"].includes(record.status)
      ? record.status
      : "completed";
    const enqueued =
      record.startedAt ?? record.completedAt ?? entry.modified?.toISOString() ?? new Date().toISOString();
    const { rowCount } = await db.query(
      `INSERT INTO jobs (id, pipeline, status, trigger, attempts, worker,
                         enqueued_at, started_at, completed_at,
                         files_processed, partitions_written, rows_deduped, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (id) DO NOTHING`,
      [
        record.id,
        slug,
        status,
        record.trigger ?? "unknown",
        record.attempts ?? 1,
        record.worker ?? null,
        enqueued,
        record.startedAt ?? null,
        record.completedAt ?? null,
        record.files_processed ?? null,
        record.partitions_written ?? null,
        record.rows_deduped ?? null,
        record.error ?? (Array.isArray(record.errors) ? record.errors.join("; ") : null),
      ],
    );
    jobs += rowCount;
  }

  return {
    slug,
    imported: `${version} version(s), ${jobs} job row(s)${already.rowCount ? " (pipeline already registered)" : ""}`,
  };
}

const slugs = process.argv.slice(2).length ? process.argv.slice(2) : await listSlugs();
await db.connect();

try {
  for (const slug of slugs) {
    const result = await importPipeline(slug);
    const detail = result.skipped ?? result.plan ?? result.imported;
    console.log(`${result.slug}: ${detail}`);
  }
  const counts = await db.query(
    "SELECT (SELECT count(*) FROM pipelines) p, (SELECT count(*) FROM config_versions) v, (SELECT count(*) FROM jobs) j",
  );
  const { p, v, j } = counts.rows[0];
  console.log(
    `\n${DRY_RUN ? "[dry run] " : ""}database now holds ${p} pipeline(s), ${v} config version(s), ${j} job row(s).`,
  );
} finally {
  await db.end();
}
