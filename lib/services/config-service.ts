// S3-backed reads/writes for Pipeline_Config, dashboards, and Parquet keys.
// Every function takes an explicit `S3Client` + config so tests can inject a stub.

import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { type S3Config } from "../config/s3-client";
import type { PipelineConfig } from "../types/config";
import type { SavedQuery } from "../types/query";
import { listAllObjectKeys, readBodyToBuffer } from "./s3-helpers";

// Errors

/** Raised when the server-stored ETag does not match the client's `If-Match`. */
export class PreconditionFailedError extends Error {
  constructor(message = "ETag mismatch on PUT") {
    super(message);
    this.name = "PreconditionFailedError";
  }
}

/** Rename target slug already has a pipeline.json; callers translate to 409. */
export class TargetExistsError extends Error {
  constructor(message = "Target pipeline slug already exists") {
    super(message);
    this.name = "TargetExistsError";
  }
}

async function streamToString(body: unknown): Promise<string> {
  return (await readBodyToBuffer(body)).toString("utf-8");
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

// Pipelines
/** A pipeline's immutable id (slug, also the S3 prefix) plus its display name. */
export interface PipelineListing {
  id: string;
  name: string;
}
// Pipeline_Config

export interface PipelineConfigWithETag {
  config: PipelineConfig;
  /** Raw JSON body as stored in S3. */
  body: string;
  /** S3 ETag (quotes stripped). */
  etag?: string;
  /** S3 LastModified (ISO). Creation time until the config is next edited. */
  lastModified?: string;
}
// Dashboards


/** A dashboard's stem id plus its display name. */
export interface DashboardListing {
  id: string;
  name: string;
}



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

// Saved queries

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
    if (rel.includes("/")) continue;
    ids.push(rel.slice(0, -".json".length));
  }
  const queries = await Promise.all(ids.map((id) => getQuery(client, config, id)));
  return queries
    .filter((q): q is SavedQuery => q !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Writes a saved query; without `overwrite`, an existing id throws
 * `TargetExistsError` so a create can't clobber an existing name. */
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

