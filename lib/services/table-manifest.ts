// Resolve which Parquet objects make up a table, by reading the manifest the
// worker publishes. Readers scan exactly the files a manifest lists rather than
// globbing the table prefix, because the prefix also holds the versions the
// worker keeps for rollback, and a glob would union all of them.

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { createS3Client, loadS3Config } from "@/lib/config/s3-client";
import { readBodyToBuffer } from "@/lib/services/s3-helpers";

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
