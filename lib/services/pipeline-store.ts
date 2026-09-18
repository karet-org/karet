// The pipeline registry and its config versions.
//
// Configs used to be a single object per pipeline in S3, with history beside it
// and the live one read directly by the worker. That meant two sources of truth
// for one document once history existed, and it meant a run read whatever the
// head said at the moment it started — so a save partway through a run left the
// result unattributable.
//
// Now: one append-only table of versions, and a pointer saying which is live. A
// run carries the version id it should use, so "which config produced these
// rows" has an answer, and a save during a run cannot change it.
//
// Node runtime only.

import { query, queryOne, transaction } from "@/lib/db";
import { normalizePipelineConfig } from "@/lib/config/migrate";
import type { PipelineConfig } from "@/lib/types/config";

export interface PipelineRow {
  slug: string;
  name: string;
  createdAt: string;
  archivedAt: string | null;
}

export interface ConfigVersion {
  id: number;
  version: number;
  config: PipelineConfig;
  authorName: string;
  note: string | null;
  createdAt: string;
  /** True for the version the pipeline currently runs. */
  live: boolean;
}

export interface ConfigVersionMeta extends Omit<ConfigVersion, "config"> {}

interface VersionRow {
  id: string | number;
  version: number;
  config: PipelineConfig;
  author_name: string;
  note: string | null;
  created_at: Date;
  live: boolean;
}

// `bigserial` arrives as a string from pg to avoid precision loss; these ids are
// nowhere near 2^53, so narrowing to a number keeps the API pleasant.
function toVersion(row: VersionRow): ConfigVersion {
  return {
    id: Number(row.id),
    version: row.version,
    // Old versions can predate a schema change, so they are upgraded on read
    // exactly as stored configs were.
    config: normalizePipelineConfig(row.config),
    authorName: row.author_name,
    note: row.note,
    createdAt: row.created_at.toISOString(),
    live: row.live,
  };
}

export async function listPipelines(): Promise<PipelineRow[]> {
  const rows = await query<{
    slug: string;
    name: string;
    created_at: Date;
    archived_at: Date | null;
  }>(
    `SELECT slug, name, created_at, archived_at
       FROM pipelines
      WHERE archived_at IS NULL
      ORDER BY name`,
  );
  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    createdAt: r.created_at.toISOString(),
    archivedAt: r.archived_at?.toISOString() ?? null,
  }));
}

export async function pipelineExists(slug: string): Promise<boolean> {
  return (await queryOne(`SELECT 1 FROM pipelines WHERE slug = $1`, [slug])) !== null;
}

/** The live config, or null when the pipeline has none. */
export async function getLiveConfig(slug: string): Promise<ConfigVersion | null> {
  const row = await queryOne<VersionRow>(
    `SELECT v.id, v.version, v.config, v.author_name, v.note, v.created_at, true AS live
       FROM pipelines_current c
       JOIN config_versions v ON v.id = c.config_version_id
      WHERE c.pipeline = $1`,
    [slug],
  );
  return row ? toVersion(row) : null;
}

export async function getVersion(slug: string, version: number): Promise<ConfigVersion | null> {
  const row = await queryOne<VersionRow>(
    `SELECT v.id, v.version, v.config, v.author_name, v.note, v.created_at,
            (c.config_version_id = v.id) AS live
       FROM config_versions v
       LEFT JOIN pipelines_current c ON c.pipeline = v.pipeline
      WHERE v.pipeline = $1 AND v.version = $2`,
    [slug, version],
  );
  return row ? toVersion(row) : null;
}

/** Version metadata, newest first. Configs are not fetched. */
export async function listVersions(slug: string): Promise<ConfigVersionMeta[]> {
  const rows = await query<Omit<VersionRow, "config">>(
    `SELECT v.id, v.version, v.author_name, v.note, v.created_at,
            (c.config_version_id = v.id) AS live
       FROM config_versions v
       LEFT JOIN pipelines_current c ON c.pipeline = v.pipeline
      WHERE v.pipeline = $1
      ORDER BY v.version DESC`,
    [slug],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    version: r.version,
    authorName: r.author_name,
    note: r.note,
    createdAt: r.created_at.toISOString(),
    live: r.live,
  }));
}

export interface SaveResult {
  versionId: number;
  version: number;
}

/**
 * Save a config as the pipeline's next version and make it live.
 *
 * One transaction: the insert and the pointer move land together, so a pipeline
 * can never reference a version that does not exist. The version number comes
 * from `max + 1` inside that transaction, and the unique constraint on
 * (pipeline, version) is what actually prevents a duplicate if two saves race —
 * the loser gets a constraint violation rather than silently overwriting.
 */
export async function saveConfig(
  slug: string,
  config: PipelineConfig,
  author: { id: string | null; name: string },
  note?: string,
): Promise<SaveResult> {
  return transaction(async (client) => {
    const { rows } = await client.query<{ id: string; version: number }>(
      `INSERT INTO config_versions (pipeline, version, config, author, author_name, note)
       VALUES (
         $1,
         COALESCE((SELECT max(version) FROM config_versions WHERE pipeline = $1), 0) + 1,
         $2, $3, $4, $5
       )
       RETURNING id, version`,
      [slug, JSON.stringify(config), author.id, author.name, note ?? null],
    );
    const created = rows[0];
    await client.query(
      `INSERT INTO pipelines_current (pipeline, config_version_id)
       VALUES ($1, $2)
       ON CONFLICT (pipeline) DO UPDATE SET config_version_id = $2, updated_at = now()`,
      [slug, created.id],
    );
    // Keep the display name in step with the config that is now live.
    await client.query(
      `UPDATE pipelines SET name = $2 WHERE slug = $1 AND name <> $2`,
      [slug, config.name ?? slug],
    );
    return { versionId: Number(created.id), version: created.version };
  });
}

/** Register a pipeline and store its first config version. */
export async function createPipeline(
  slug: string,
  config: PipelineConfig,
  author: { id: string | null; name: string },
): Promise<SaveResult> {
  await query(
    `INSERT INTO pipelines (slug, name, created_by) VALUES ($1, $2, $3)
     ON CONFLICT (slug) DO NOTHING`,
    [slug, config.name ?? slug, author.id],
  );
  return saveConfig(slug, config, author, "created");
}

export async function deletePipeline(slug: string): Promise<void> {
  // Versions, the pointer and job rows cascade from here.
  await query(`DELETE FROM pipelines WHERE slug = $1`, [slug]);
}

export async function renamePipeline(slug: string, name: string): Promise<void> {
  await query(`UPDATE pipelines SET name = $2 WHERE slug = $1`, [slug, name]);
}
