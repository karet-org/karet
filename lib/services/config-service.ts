// S3-backed reads/writes for Pipeline_Config, dashboards, and Parquet keys.
//
// All functions take an explicit `S3Client` + config so tests can inject a
// stub client. The API routes wire the environment-derived pair.

import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  type ObjectIdentifier,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import type { S3Config } from "../config/s3-client";
import type { PipelineConfig } from "../types/config";
import type { DashboardConfig } from "../types/dashboard";
import { listAllObjectKeys, readBodyToBuffer } from "./s3-helpers";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Raised when the server-stored ETag does not match the client's `If-Match`. */
export class PreconditionFailedError extends Error {
  constructor(message = "ETag mismatch on PUT") {
    super(message);
    this.name = "PreconditionFailedError";
  }
}

/**
 * Raised when the rename target slug already has a pipeline.json.
 * Callers should translate into 409 Conflict.
 */
export class TargetExistsError extends Error {
  constructor(message = "Target pipeline slug already exists") {
    super(message);
    this.name = "TargetExistsError";
  }
}

/**
 * Raised when no objects exist under the source prefix.
 * Callers should translate into 404.
 */
export class SourceNotFoundError extends Error {
  constructor(message = "Source pipeline not found") {
    super(message);
    this.name = "SourceNotFoundError";
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function streamToString(body: unknown): Promise<string> {
  return (await readBodyToBuffer(body)).toString("utf-8");
}

/** Strip surrounding quotes from an S3 ETag (S3 returns `"abc123"`). */
function normalizeETag(etag: string | undefined): string | undefined {
  if (!etag) return undefined;
  return etag.replace(/^"|"$/g, "");
}

function isNotFound(err: unknown): boolean {
  if (err instanceof NoSuchKey) return true;
  if (err instanceof S3ServiceException) {
    return (
      err.name === "NoSuchKey" ||
      err.name === "NotFound" ||
      err.$metadata?.httpStatusCode === 404
    );
  }
  return false;
}

// ---------------------------------------------------------------------------
// Pipelines
// ---------------------------------------------------------------------------

/** Lists pipeline slugs by finding `pipeline.json` files under the pipelines prefix. */
export async function listPipelines(
  client: S3Client,
  config: S3Config,
): Promise<string[]> {
  const allKeys = await listAllObjectKeys(client, config.bucket, config.pipelinesPrefix);
  const slugs: string[] = [];
  for (const key of allKeys) {
    if (!key.endsWith("/pipeline.json")) continue;
    const rel = key.slice(config.pipelinesPrefix.length);
    const slash = rel.indexOf("/");
    if (slash === -1) continue;
    const slug = rel.slice(0, slash);
    if (slug && !slugs.includes(slug)) slugs.push(slug);
  }
  return slugs;
}

// ---------------------------------------------------------------------------
// Pipeline_Config
// ---------------------------------------------------------------------------

export interface PipelineConfigWithETag {
  config: PipelineConfig;
  /** Raw JSON body as stored in S3. */
  body: string;
  /** S3 ETag (quotes stripped). */
  etag?: string;
}

/** Reads the Pipeline_Config from S3. Returns `null` if missing. */
export async function getPipelineConfig(
  client: S3Client,
  config: S3Config,
): Promise<PipelineConfigWithETag | null> {
  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: config.pipelineConfigKey,
      }),
    );
    const body = await streamToString(response.Body);
    const parsed = JSON.parse(body) as PipelineConfig;
    return { config: parsed, body, etag: normalizeETag(response.ETag) };
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/**
 * Writes the Pipeline_Config body to S3.
 *
 * `ifMatch` enables optimistic concurrency. S3 PutObject doesn't honor
 * `If-Match` consistently across S3-compatible stores (notably RustFS),
 * so we do the compare-and-swap ourselves against a fresh GET.
 *
 * The returned ETag is read via HEAD after the PUT, not taken from the
 * PutObject response: on RustFS the two values can differ, which would
 * make the next save spuriously 412.
 */
export async function putPipelineConfig(
  client: S3Client,
  config: S3Config,
  body: string,
  ifMatch?: string,
): Promise<{ etag?: string }> {
  if (ifMatch !== undefined) {
    const current = await getPipelineConfig(client, config);
    const currentEtag = current?.etag;
    if (currentEtag !== ifMatch) {
      throw new PreconditionFailedError(
        `ETag mismatch: expected ${ifMatch}, got ${currentEtag ?? "<none>"}`,
      );
    }
  }

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: config.pipelineConfigKey,
      Body: body,
      ContentType: "application/json",
    }),
  );

  try {
    const head = await client.send(
      new HeadObjectCommand({
        Bucket: config.bucket,
        Key: config.pipelineConfigKey,
      }),
    );
    return { etag: normalizeETag(head.ETag) };
  } catch {
    // HEAD failure is non-fatal; the write itself succeeded.
    return { etag: undefined };
  }
}

// ---------------------------------------------------------------------------
// Dashboards
// ---------------------------------------------------------------------------

/** Lists dashboard config file stems (name without `.json`). */
export async function listDashboards(
  client: S3Client,
  config: S3Config,
): Promise<string[]> {
  const allKeys = await listAllObjectKeys(client, config.bucket, config.dashboardsPrefix);
  const names: string[] = [];
  for (const key of allKeys) {
    if (!key.endsWith(".json")) continue;
    const rel = key.slice(config.dashboardsPrefix.length);
    // Skip nested keys (e.g. `dashboards/subdir/x.json`).
    if (rel.includes("/")) continue;
    names.push(rel.slice(0, -".json".length));
  }
  return names;
}

/** Reads a dashboard by stem. Returns `null` when missing. */
export async function getDashboard(
  client: S3Client,
  config: S3Config,
  name: string,
): Promise<DashboardConfig | null> {
  const key = `${config.dashboardsPrefix}${name}.json`;
  try {
    const response = await client.send(
      new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    );
    const body = await streamToString(response.Body);
    return JSON.parse(body) as DashboardConfig;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Rename (slug move)
// ---------------------------------------------------------------------------

/**
 * Move every object from `pipelines/<from>/` to `pipelines/<to>/` by
 * copying then deleting. S3 has no atomic rename; this performs:
 *
 *   1. Pre-flight HEAD on `<to>/pipeline.json` -- throws `TargetExistsError`
 *      (409) before touching any data if the destination is occupied.
 *   2. Lists every object under the source prefix -- throws
 *      `SourceNotFoundError` (404) if empty.
 *   3. Copies each object to the new prefix.
 *   4. Deletes the originals in batches of 1000 (S3's API cap).
 *
 * If a copy fails the old prefix is intact and the caller can retry. If a
 * delete fails after all copies succeed, the pipeline lives at the new
 * slug while orphaned bytes remain at the old one (subsequent rename to
 * the same target hits the 409 pre-flight; cleanup is out-of-band).
 *
 * Returns the number of objects moved.
 */
export async function renamePipelinePrefix(
  client: S3Client,
  bucket: string,
  pipelinesPrefix: string,
  fromSlug: string,
  toSlug: string,
): Promise<number> {
  const fromPrefix = `${pipelinesPrefix}${fromSlug}/`;
  const toPrefix = `${pipelinesPrefix}${toSlug}/`;

  try {
    await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: `${toPrefix}pipeline.json` }),
    );
    throw new TargetExistsError(`Pipeline "${toSlug}" already exists`);
  } catch (err) {
    if (err instanceof TargetExistsError) throw err;
    if (!isNotFound(err)) throw err;
  }

  const keys = await listAllObjectKeys(client, bucket, fromPrefix);
  if (keys.length === 0) {
    throw new SourceNotFoundError(`Pipeline "${fromSlug}" not found`);
  }

  for (const key of keys) {
    const destKey = `${toPrefix}${key.slice(fromPrefix.length)}`;
    await client.send(
      new CopyObjectCommand({
        Bucket: bucket,
        // CopySource is `/<bucket>/<key>`, URL-encoded except slashes.
        CopySource: `/${bucket}/${encodeURIComponent(key).replace(/%2F/g, "/")}`,
        Key: destKey,
      }),
    );
  }

  const toDelete: ObjectIdentifier[] = keys.map((Key) => ({ Key }));
  for (let i = 0; i < toDelete.length; i += 1000) {
    const chunk = toDelete.slice(i, i + 1000);
    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: chunk, Quiet: true },
      }),
    );
  }

  return keys.length;
}

// ---------------------------------------------------------------------------
// Analytic table rows (Parquet)
// ---------------------------------------------------------------------------

/** Lists every `*.parquet` key under `clean/<table>/` (recursive). */
export async function listParquetKeys(
  client: S3Client,
  config: S3Config,
  table: string,
): Promise<string[]> {
  const prefix = `${config.cleanPrefix}${table}/`;
  const allKeys = await listAllObjectKeys(client, config.bucket, prefix);
  return allKeys.filter((k) => k.endsWith(".parquet"));
}

/** Fetches a single object from S3 as a Buffer. */
export async function fetchObject(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<Buffer> {
  const response = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  if (!response.Body) throw new Error(`Empty body for s3://${bucket}/${key}`);
  return readBodyToBuffer(response.Body);
}
