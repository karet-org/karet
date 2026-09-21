// Resolve which Parquet objects make up a table, by reading the manifest the
// worker publishes. Readers scan exactly the files a manifest lists rather than
// globbing the table prefix, because the prefix also holds the versions the
// worker keeps for rollback, and a glob would union all of them.

import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { createS3Client, loadS3Config } from "@/lib/config/s3-client";
import { listAllObjectKeys, readBodyToBuffer } from "@/lib/services/s3-helpers";

export const CURRENT_KEY = "_current.json";
export const MANIFEST_PREFIX = "_manifests/";

export interface ManifestFile {
  /** Key relative to the table prefix, e.g. `v7/year=2026/month=9/m.parquet`. */
  key: string;
  mapping_id: string;
  bytes: number;
}

export interface TableManifest {
  version: number;
  created_at: string;
  job_id?: string;
  files: ManifestFile[];
}

/** Warehouse prefix a table's objects live under. */
export function tablePrefix(slug: string, tableId: string): string {
  const config = loadS3Config();
  return `${config.pipelinesPrefix}${slug}/${tableId}/`;
}

let client: ReturnType<typeof createS3Client> | null = null;

async function readJson<T>(key: string): Promise<T | null> {
  const config = loadS3Config();
  client ??= createS3Client(config);
  try {
    const res = await client.send(
      new GetObjectCommand({ Bucket: config.warehouseBucket, Key: key }),
    );
    const buf = await readBodyToBuffer(res.Body);
    return JSON.parse(buf.toString("utf8")) as T;
  } catch {
    // Absent or unreadable: an unpublished table, not an error.
    return null;
  }
}

/**
 * The manifest a reader should scan: the version `_current.json` points at, or
 * an explicit `version` for time travel. Null when the table has never been
 * published.
 */
export async function readManifest(
  slug: string,
  tableId: string,
  version?: number,
): Promise<TableManifest | null> {
  const prefix = tablePrefix(slug, tableId);
  let target = version;
  if (target === undefined) {
    const pointer = await readJson<{ version: number }>(`${prefix}${CURRENT_KEY}`);
    if (!pointer) return null;
    target = pointer.version;
  }
  return readJson<TableManifest>(`${prefix}${MANIFEST_PREFIX}${target}.json`);
}

/** Absolute `s3://` URLs for a manifest's files. */
export function manifestUrls(
  slug: string,
  tableId: string,
  manifest: TableManifest,
): string[] {
  const config = loadS3Config();
  const prefix = tablePrefix(slug, tableId);
  return manifest.files.map(
    (f) => `s3://${config.warehouseBucket}/${prefix}${f.key}`,
  );
}

export interface TableVersionMeta {
  version: number;
  created_at: string;
  job_id?: string;
  files: number;
  bytes: number;
  /** True for the version readers are currently scanning. */
  live: boolean;
}

/**
 * Versions still on disk, newest first. The worker retains a bounded number, so
 * this is the window a table can be rolled back into or queried as of.
 */
export async function listTableVersions(
  slug: string,
  tableId: string,
): Promise<TableVersionMeta[]> {
  const prefix = tablePrefix(slug, tableId);
  const pointer = await readJson<{ version: number }>(`${prefix}${CURRENT_KEY}`);
  if (!pointer) return [];

  const config = loadS3Config();
  client ??= createS3Client(config);
  const keys = await listAllObjectKeys(
    client,
    config.warehouseBucket,
    `${prefix}${MANIFEST_PREFIX}`,
  );
  const versions = keys
    .map((k) => Number(k.slice(`${prefix}${MANIFEST_PREFIX}`.length).replace(/\.json$/, "")))
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => b - a);

  const entries = await Promise.all(
    versions.map(async (v) => {
      const manifest = await readJson<TableManifest>(`${prefix}${MANIFEST_PREFIX}${v}.json`);
      if (!manifest) return null;
      return {
        version: manifest.version,
        created_at: manifest.created_at,
        ...(manifest.job_id ? { job_id: manifest.job_id } : {}),
        files: manifest.files.length,
        bytes: manifest.files.reduce((sum, f) => sum + (f.bytes ?? 0), 0),
        live: manifest.version === pointer.version,
      } satisfies TableVersionMeta;
    }),
  );
  return entries.filter((e): e is TableVersionMeta => e !== null);
}

/**
 * Make an older version live again by writing its file list forward as a new
 * version, then flipping the pointer.
 *
 * Forward rather than backward for the same reason config restore is: the
 * pointer only ever moves up, so the worker's next run cannot collide with a
 * version number it already used, and the rollback is itself a version someone
 * can roll back out of. No Parquet is copied — both versions name the same
 * objects, and vacuum only deletes what no retained manifest references.
 */
export async function restoreTableVersion(
  slug: string,
  tableId: string,
  version: number,
): Promise<{ version: number } | { error: string }> {
  const prefix = tablePrefix(slug, tableId);
  const source = await readManifest(slug, tableId, version);
  if (!source) return { error: "version_not_found" };

  const pointer = await readJson<{ version: number }>(`${prefix}${CURRENT_KEY}`);
  const next = (pointer?.version ?? source.version) + 1;
  const manifest: TableManifest = {
    version: next,
    created_at: new Date().toISOString(),
    files: source.files,
  };

  const config = loadS3Config();
  client ??= createS3Client(config);
  const put = async (key: string, body: unknown) => {
    await client!.send(
      new PutObjectCommand({
        Bucket: config.warehouseBucket,
        Key: key,
        Body: JSON.stringify(body),
        ContentType: "application/json",
      }),
    );
  };
  // Manifest first, pointer second: the pointer PUT is the publish.
  await put(`${prefix}${MANIFEST_PREFIX}${next}.json`, manifest);
  await put(`${prefix}${CURRENT_KEY}`, { version: next });
  return { version: next };
}
