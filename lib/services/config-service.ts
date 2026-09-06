// S3-backed reads/writes for Pipeline_Config, dashboards, and Parquet keys.
//
// All functions take an explicit `S3Client` + config so tests can inject a
// stub client. The API routes wire the environment-derived pair.

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  type ObjectIdentifier,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { allBuckets, type S3Config } from "../config/s3-client";
import type { PipelineConfig } from "../types/config";
import type { DashboardConfig } from "../types/dashboard";
import type { SavedQuery } from "../types/query";
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

/**
 * Normalize an S3-style ETag for comparison.
 *
 * Strips:
 * - Surrounding quotes (S3 wraps the value: `"abc123"`).
 * - Trailing alphabetic codec suffix `-<codec>` (RustFS returns ETags
 *   like `<md5>-zstd` for compressed-at-rest objects, but the same
 *   `GetObject` can return the bare `<md5>` form on later reads, which
 *   would break optimistic concurrency).
 *
 * Multipart ETags (`<md5>-<digits>`) are preserved: only an alphabetic
 * suffix is stripped, never a numeric one.
 */
function normalizeETag(etag: string | undefined): string | undefined {
  if (!etag) return undefined;
  return etag.replace(/^"|"$/g, "").replace(/-[a-zA-Z]+$/, "");
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
  const allKeys = await listAllObjectKeys(client, config.pipelinesBucket, config.pipelinesPrefix);
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
        Bucket: config.pipelinesBucket,
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
    const normalizedIfMatch = normalizeETag(ifMatch);
    if (currentEtag !== normalizedIfMatch) {
      throw new PreconditionFailedError(
        `ETag mismatch: expected ${normalizedIfMatch}, got ${currentEtag ?? "<none>"}`,
      );
    }
  }

  await client.send(
    new PutObjectCommand({
      Bucket: config.pipelinesBucket,
      Key: config.pipelineConfigKey,
      Body: body,
      ContentType: "application/json",
    }),
  );

  try {
    const head = await client.send(
      new HeadObjectCommand({
        Bucket: config.pipelinesBucket,
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
  const allKeys = await listAllObjectKeys(client, config.pipelinesBucket, config.dashboardsPrefix);
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

/** A dashboard's stem id plus its display name. */
export interface DashboardListing {
  id: string;
  name: string;
}

/** Lists dashboards with display names, falling back to the id, sorted by name. */
export async function listDashboardsWithNames(
  client: S3Client,
  config: S3Config,
): Promise<DashboardListing[]> {
  const ids = await listDashboards(client, config);
  const listings = await Promise.all(
    ids.map(async (id): Promise<DashboardListing> => {
      try {
        const dash = await getDashboard(client, config, id);
        const name = dash?.name?.trim();
        return { id, name: name && name.length > 0 ? name : id };
      } catch {
        return { id, name: id };
      }
    }),
  );
  listings.sort((a, b) => a.name.localeCompare(b.name));
  return listings;
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
      new GetObjectCommand({ Bucket: config.pipelinesBucket, Key: key }),
    );
    const body = await streamToString(response.Body);
    return JSON.parse(body) as DashboardConfig;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

// --- v2 (YAML) dashboard storage. v1 JSON functions below are removed at
// the top of the v2 stack. ---

import { validateDashboardV2 } from "@/lib/types/dashboard-v2";
import type { DashboardConfigV2 } from "@/lib/types/dashboard-v2";

function yamlKey(config: S3Config, id: string, draft: boolean): string {
  return draft
    ? `${config.dashboardsPrefix}drafts/${id}.yaml`
    : `${config.dashboardsPrefix}${id}.yaml`;
}

export interface DashboardV2WithBody {
  body: string;
  /** Parsed config, or null when the stored body doesn't validate. */
  config: DashboardConfigV2 | null;
}

/** Reads a v2 dashboard body (published or draft). Returns null if missing. */
export async function getDashboardV2(
  client: S3Client,
  config: S3Config,
  id: string,
  opts: { draft?: boolean } = {},
): Promise<DashboardV2WithBody | null> {
  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: config.pipelinesBucket,
        Key: yamlKey(config, id, !!opts.draft),
      }),
    );
    const body = await streamToString(response.Body);
    const result = validateDashboardV2(body);
    return { body, config: result.ok ? result.config : null };
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

export async function putDashboardV2(
  client: S3Client,
  config: S3Config,
  id: string,
  body: string,
  opts: { draft: boolean },
): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: config.pipelinesBucket,
      Key: yamlKey(config, id, opts.draft),
      Body: body,
      ContentType: "application/yaml",
    }),
  );
}

/** Published v2 dashboard ids. */
export async function listDashboardsV2(
  client: S3Client,
  config: S3Config,
): Promise<string[]> {
  const allKeys = await listAllObjectKeys(client, config.pipelinesBucket, config.dashboardsPrefix);
  const ids: string[] = [];
  for (const key of allKeys) {
    if (!key.endsWith(".yaml")) continue;
    const rel = key.slice(config.dashboardsPrefix.length);
    if (rel.includes("/")) continue;
    ids.push(rel.slice(0, -".yaml".length));
  }
  return ids;
}

/** Draft v2 dashboard ids. */
export async function listDraftDashboardsV2(
  client: S3Client,
  config: S3Config,
): Promise<string[]> {
  const prefix = `${config.dashboardsPrefix}drafts/`;
  const allKeys = await listAllObjectKeys(client, config.pipelinesBucket, prefix);
  return allKeys
    .filter((k) => k.endsWith(".yaml") && !k.slice(prefix.length).includes("/"))
    .map((k) => k.slice(prefix.length, -".yaml".length));
}

/** Listing with display names from the parsed config. */
export async function listDashboardsWithNamesV2(
  client: S3Client,
  config: S3Config,
): Promise<DashboardListing[]> {
  const ids = await listDashboardsV2(client, config);
  const listings = await Promise.all(
    ids.map(async (id): Promise<DashboardListing> => {
      try {
        const dash = await getDashboardV2(client, config, id);
        const name = dash?.config?.name?.trim();
        return { id, name: name && name.length > 0 ? name : id };
      } catch {
        return { id, name: id };
      }
    }),
  );
  listings.sort((a, b) => a.name.localeCompare(b.name));
  return listings;
}

/** Deletes a v2 dashboard (draft and published objects). */
export async function deleteDashboardV2(
  client: S3Client,
  config: S3Config,
  id: string,
): Promise<void> {
  for (const draft of [true, false]) {
    try {
      await client.send(
        new DeleteObjectCommand({
          Bucket: config.pipelinesBucket,
          Key: yamlKey(config, id, draft),
        }),
      );
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }
}

/** Copies a validated draft body to the published key, removes the draft. */
export async function publishDashboardV2(
  client: S3Client,
  config: S3Config,
  id: string,
  body: string,
): Promise<void> {
  await putDashboardV2(client, config, id, body, { draft: false });
  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: config.pipelinesBucket,
        Key: yamlKey(config, id, true),
      }),
    );
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }
}

/** Drafts live under `dashboards/drafts/`, invisible to listDashboards. */
function draftKey(config: S3Config, id: string): string {
  return `${config.dashboardsPrefix}drafts/${id}.json`;
}

function publishedKey(config: S3Config, id: string): string {
  return `${config.dashboardsPrefix}${id}.json`;
}

/** Reads a draft dashboard body. Returns `null` when missing. */
export async function getDraftDashboard(
  client: S3Client,
  config: S3Config,
  id: string,
): Promise<string | null> {
  try {
    const response = await client.send(
      new GetObjectCommand({ Bucket: config.pipelinesBucket, Key: draftKey(config, id) }),
    );
    return await streamToString(response.Body);
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/** Lists draft dashboard ids. */
export async function listDraftDashboards(
  client: S3Client,
  config: S3Config,
): Promise<string[]> {
  const prefix = `${config.dashboardsPrefix}drafts/`;
  const allKeys = await listAllObjectKeys(client, config.pipelinesBucket, prefix);
  return allKeys
    .filter((k) => k.endsWith(".json") && !k.slice(prefix.length).includes("/"))
    .map((k) => k.slice(prefix.length, -".json".length));
}

/** Writes a dashboard body, as a draft or directly to the published key. */
export async function putDashboard(
  client: S3Client,
  config: S3Config,
  id: string,
  body: string,
  opts: { draft: boolean },
): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: config.pipelinesBucket,
      Key: opts.draft ? draftKey(config, id) : publishedKey(config, id),
      Body: body,
      ContentType: "application/json",
    }),
  );
}

/** Deletes a dashboard (both the draft and published objects, if present). */
export async function deleteDashboard(
  client: S3Client,
  config: S3Config,
  id: string,
): Promise<void> {
  for (const key of [draftKey(config, id), publishedKey(config, id)]) {
    try {
      await client.send(
        new DeleteObjectCommand({ Bucket: config.pipelinesBucket, Key: key }),
      );
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }
}

/** Copies a validated draft body to the published key, removes the draft. */
export async function publishDashboard(
  client: S3Client,
  config: S3Config,
  id: string,
  body: string,
): Promise<void> {
  await putDashboard(client, config, id, body, { draft: false });
  try {
    await client.send(
      new DeleteObjectCommand({ Bucket: config.pipelinesBucket, Key: draftKey(config, id) }),
    );
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }
}

// ---------------------------------------------------------------------------
// Saved queries
// ---------------------------------------------------------------------------

/** Reads a saved query by stem. Returns `null` when missing. */
export async function getQuery(
  client: S3Client,
  config: S3Config,
  id: string,
): Promise<SavedQuery | null> {
  const key = `${config.queriesPrefix}${id}.json`;
  try {
    const response = await client.send(
      new GetObjectCommand({ Bucket: config.pipelinesBucket, Key: key }),
    );
    const body = await streamToString(response.Body);
    return JSON.parse(body) as SavedQuery;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/** Lists saved queries (id + name), sorted by name. */
export async function listQueries(
  client: S3Client,
  config: S3Config,
): Promise<SavedQuery[]> {
  const allKeys = await listAllObjectKeys(client, config.pipelinesBucket, config.queriesPrefix);
  const ids: string[] = [];
  for (const key of allKeys) {
    if (!key.endsWith(".json")) continue;
    const rel = key.slice(config.queriesPrefix.length);
    if (rel.includes("/")) continue; // skip nested keys
    ids.push(rel.slice(0, -".json".length));
  }
  const queries = await Promise.all(ids.map((id) => getQuery(client, config, id)));
  return queries
    .filter((q): q is SavedQuery => q !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Writes a saved query. When `overwrite` is false (the default), a query
 * already stored under the same id throws `TargetExistsError` so a create
 * can't clobber an existing name.
 */
export async function putQuery(
  client: S3Client,
  config: S3Config,
  q: SavedQuery,
  overwrite = false,
): Promise<void> {
  if (!overwrite) {
    const existing = await getQuery(client, config, q.id);
    if (existing) {
      throw new TargetExistsError(`A query named "${q.name}" already exists`);
    }
  }
  await client.send(
    new PutObjectCommand({
      Bucket: config.pipelinesBucket,
      Key: `${config.queriesPrefix}${q.id}.json`,
      Body: JSON.stringify(q, null, 2),
      ContentType: "application/json",
    }),
  );
}

/** Deletes a saved query by stem. No-op if it doesn't exist. */
export async function deleteQuery(
  client: S3Client,
  config: S3Config,
  id: string,
): Promise<void> {
  await client.send(
    new DeleteObjectCommand({
      Bucket: config.pipelinesBucket,
      Key: `${config.queriesPrefix}${id}.json`,
    }),
  );
}

// ---------------------------------------------------------------------------
// Rename (slug move)
// ---------------------------------------------------------------------------

/**
 * Move every object from `pipelines/<from>/` to `pipelines/<to>/` by
 * copying then deleting, across all three data-plane buckets (a pipeline's
 * config, raw data, and warehouse output each live in their own bucket).
 * S3 has no atomic rename; this performs:
 *
 *   1. Pre-flight HEAD on `<to>/pipeline.json` in the pipelines bucket,
 *      throws `TargetExistsError` (409) before touching any data if the
 *      destination is occupied.
 *   2. Lists every object under the source prefix across all buckets,
 *      throws `SourceNotFoundError` (404) if none exist anywhere.
 *   3. Copies each object to the new prefix within its own bucket.
 *   4. Deletes the originals in batches of 1000 (S3's API cap).
 *
 * If a copy fails the old prefix is intact and the caller can retry. If a
 * delete fails after all copies succeed, the pipeline lives at the new
 * slug while orphaned bytes remain at the old one (subsequent rename to
 * the same target hits the 409 pre-flight; cleanup is out-of-band).
 *
 * Returns the total number of objects moved across all buckets.
 */
export async function renamePipelinePrefix(
  client: S3Client,
  config: S3Config,
  fromSlug: string,
  toSlug: string,
): Promise<number> {
  const { pipelinesPrefix } = config;
  const fromPrefix = `${pipelinesPrefix}${fromSlug}/`;
  const toPrefix = `${pipelinesPrefix}${toSlug}/`;

  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: config.pipelinesBucket,
        Key: `${toPrefix}pipeline.json`,
      }),
    );
    throw new TargetExistsError(`Pipeline "${toSlug}" already exists`);
  } catch (err) {
    if (err instanceof TargetExistsError) throw err;
    if (!isNotFound(err)) throw err;
  }

  let moved = 0;
  let sawAny = false;

  for (const bucket of allBuckets(config)) {
    const keys = await listAllObjectKeys(client, bucket, fromPrefix);
    if (keys.length === 0) continue;
    sawAny = true;

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

    moved += keys.length;
  }

  if (!sawAny) {
    throw new SourceNotFoundError(`Pipeline "${fromSlug}" not found`);
  }

  return moved;
}

// ---------------------------------------------------------------------------
// Analytic table rows (Parquet)
// ---------------------------------------------------------------------------

/**
 * Lists every `*.parquet` key under `<pipeline>/<table>/` (recursive) in the
 * warehouse bucket.
 */
export async function listParquetKeys(
  client: S3Client,
  config: S3Config,
  table: string,
): Promise<string[]> {
  const prefix = `${config.warehousePrefix}${table}/`;
  const allKeys = await listAllObjectKeys(client, config.warehouseBucket, prefix);
  return allKeys.filter((k) => k.endsWith(".parquet"));
}
