// Config history: who changed a pipeline, when, and what it looked like.
//
// Layout mirrors the warehouse manifests, so there is one idea of "a version"
// in the system rather than two:
//
//   pipelines/<slug>/pipeline.json          the head, what the worker reads
//   pipelines/<slug>/_history/<n>.json      { version, saved_at, author, note, config }
//
// The head stays exactly where it was, so nothing downstream (the worker, the
// export, the graph) has to know history exists. An entry is written after the
// head lands, so a failed write leaves no phantom version.
//
// Numbering comes from the listing rather than a counter object: there are tens
// of entries, not millions, and a counter is one more thing to get out of step.

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import type { S3Config } from "@/lib/config/s3-client";
import { listAllObjectKeys, readBodyToBuffer } from "./s3-helpers";

/** How many versions to keep per pipeline. Configs are small; keep plenty. */
export const RETAINED_VERSIONS = 100;

export interface ConfigVersionMeta {
  version: number;
  saved_at: string;
  /** Username, or "service" for a token-authenticated write. */
  author: string;
  /** Free text, e.g. "reverted to v3". */
  note?: string;
}

export interface ConfigVersion extends ConfigVersionMeta {
  /** The config as saved, verbatim. */
  config: unknown;
}

function historyPrefix(config: S3Config, slug: string): string {
  return `${config.pipelinesPrefix}${slug}/_history/`;
}

function versionKey(config: S3Config, slug: string, version: number): string {
  return `${historyPrefix(config, slug)}${version}.json`;
}

/** Version numbers present, oldest first. */
export async function listVersionNumbers(
  client: S3Client,
  config: S3Config,
  slug: string,
): Promise<number[]> {
  const prefix = historyPrefix(config, slug);
  const keys = await listAllObjectKeys(client, config.pipelinesBucket, prefix);
  return keys
    .map((k) => Number(k.slice(prefix.length).replace(/\.json$/, "")))
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => a - b);
}

export async function readVersion(
  client: S3Client,
  config: S3Config,
  slug: string,
  version: number,
): Promise<ConfigVersion | null> {
  try {
    const res = await client.send(
      new GetObjectCommand({
        Bucket: config.pipelinesBucket,
        Key: versionKey(config, slug, version),
      }),
    );
    return JSON.parse((await readBodyToBuffer(res.Body)).toString("utf8")) as ConfigVersion;
  } catch {
    return null;
  }
}

/** Every version's metadata, newest first. The configs themselves are not read. */
export async function listVersions(
  client: S3Client,
  config: S3Config,
  slug: string,
): Promise<ConfigVersionMeta[]> {
  const numbers = await listVersionNumbers(client, config, slug);
  const entries = await Promise.all(
    numbers.map((n) => readVersion(client, config, slug, n)),
  );
  return entries
    .flatMap((e) => (e ? [{ version: e.version, saved_at: e.saved_at, author: e.author, note: e.note }] : []))
    .sort((a, b) => b.version - a.version);
}

/**
 * Record a config as the next version. Returns the version written, or null
 * when history could not be recorded.
 *
 * Never throws: losing the audit trail for one save is bad, but failing the
 * save the user just made because the trail could not be written is worse, and
 * the head is already committed by the time this runs.
 */
export async function recordVersion(
  client: S3Client,
  config: S3Config,
  slug: string,
  body: string,
  author: string,
  note?: string,
): Promise<number | null> {
  try {
    const existing = await listVersionNumbers(client, config, slug);
    const version = (existing.at(-1) ?? 0) + 1;
    const entry: ConfigVersion = {
      version,
      saved_at: new Date().toISOString(),
      author,
      ...(note ? { note } : {}),
      config: JSON.parse(body),
    };
    await client.send(
      new PutObjectCommand({
        Bucket: config.pipelinesBucket,
        Key: versionKey(config, slug, version),
        Body: JSON.stringify(entry),
        ContentType: "application/json",
      }),
    );
    await prune(client, config, slug, [...existing, version]);
    return version;
  } catch {
    return null;
  }
}

/** Drop the oldest entries past the retention window. */
async function prune(
  client: S3Client,
  config: S3Config,
  slug: string,
  versions: number[],
): Promise<void> {
  const doomed = versions.slice(0, Math.max(0, versions.length - RETAINED_VERSIONS));
  for (const version of doomed) {
    try {
      await client.send(
        new DeleteObjectCommand({
          Bucket: config.pipelinesBucket,
          Key: versionKey(config, slug, version),
        }),
      );
    } catch {
      // A stuck delete costs storage, not correctness.
    }
  }
}
