#!/usr/bin/env node
// Adopt pre-manifest warehouse output into version 1.
//
// Before manifests, a run wrote Parquet straight to
// `pipelines/<slug>/<table>/<hive segments>/<mapping>.parquet` and readers
// globbed the prefix. Readers now resolve `_current.json`, so those tables read
// as empty until a run republishes them. This lists what is already there and
// writes a manifest describing it, so existing data stays queryable across the
// upgrade without moving a single object.
//
// Idempotent: a table that already has `_current.json` is left alone.
//
//   node scripts/adopt-warehouse-manifests.mjs            # every pipeline
//   node scripts/adopt-warehouse-manifests.mjs <slug> ... # named pipelines
//   DRY_RUN=1 node scripts/adopt-warehouse-manifests.mjs   # report only

import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const PIPELINES_BUCKET = process.env.S3_BUCKET_PIPELINES || "karet-pipelines";
const WAREHOUSE_BUCKET = process.env.S3_BUCKET_WAREHOUSE || "karet-warehouse";
const PIPELINES_PREFIX = process.env.PIPELINES_PREFIX || "pipelines/";
const DRY_RUN = process.env.DRY_RUN === "1";

const client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  endpoint: process.env.AWS_ENDPOINT_URL || undefined,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
});

async function listKeys(bucket, prefix) {
  const keys = [];
  let token;
  do {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    );
    for (const o of res.Contents ?? []) keys.push({ key: o.Key, size: o.Size ?? 0 });
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

async function getJson(bucket, key) {
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return JSON.parse(await res.Body.transformToString());
  } catch {
    return null;
  }
}

async function listPipelineSlugs() {
  const res = await client.send(
    new ListObjectsV2Command({
      Bucket: PIPELINES_BUCKET,
      Prefix: PIPELINES_PREFIX,
      Delimiter: "/",
    }),
  );
  return (res.CommonPrefixes ?? [])
    .map((p) => p.Prefix.slice(PIPELINES_PREFIX.length).replace(/\/$/, ""))
    .filter(Boolean);
}

async function adoptTable(slug, tableId) {
  const prefix = `${PIPELINES_PREFIX}${slug}/${tableId}/`;
  if (await getJson(WAREHOUSE_BUCKET, `${prefix}_current.json`)) {
    return { table: tableId, status: "already versioned" };
  }

  // Legacy layout only: anything already under `v<N>/` belongs to a version.
  const objects = (await listKeys(WAREHOUSE_BUCKET, prefix)).filter(
    (o) => o.key.endsWith(".parquet") && !/\/v\d+\//.test(o.key),
  );
  if (objects.length === 0) return { table: tableId, status: "no output" };

  const files = objects.map((o) => {
    const relative = o.key.slice(prefix.length);
    const filename = relative.split("/").pop() ?? relative;
    return {
      key: relative,
      mapping_id: filename.replace(/\.parquet$/, ""),
      bytes: o.size,
    };
  });
  files.sort((a, b) => a.key.localeCompare(b.key));

  const manifest = {
    version: 1,
    created_at: new Date().toISOString(),
    files,
  };

  if (!DRY_RUN) {
    const put = (key, body) =>
      client.send(
        new PutObjectCommand({
          Bucket: WAREHOUSE_BUCKET,
          Key: key,
          Body: JSON.stringify(body),
          ContentType: "application/json",
        }),
      );
    // Manifest first, pointer second: the pointer is the publish.
    await put(`${prefix}_manifests/1.json`, manifest);
    await put(`${prefix}_current.json`, { version: 1 });
  }
  return { table: tableId, status: `adopted ${files.length} file(s) as v1` };
}

const slugs = process.argv.slice(2).length ? process.argv.slice(2) : await listPipelineSlugs();
let adopted = 0;

for (const slug of slugs) {
  const config = await getJson(PIPELINES_BUCKET, `${PIPELINES_PREFIX}${slug}/pipeline.json`);
  if (!config) {
    console.log(`${slug}: no pipeline.json, skipped`);
    continue;
  }
  const tables = config.analytic_tables ?? [];
  if (tables.length === 0) {
    console.log(`${slug}: no analytic tables`);
    continue;
  }
  for (const t of tables) {
    const result = await adoptTable(slug, t.id);
    if (result.status.startsWith("adopted")) adopted += 1;
    console.log(`${slug}/${result.table}: ${result.status}`);
  }
}

console.log(`\n${DRY_RUN ? "[dry run] " : ""}${adopted} table(s) adopted.`);
