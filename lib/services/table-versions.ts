// Versions of a table, read from the DuckLake catalog. A version is a snapshot
// that changed the table's rows; its number is the snapshot id. The worker
// writes the catalog and keeps the last 10 versions of each table, so restore
// goes through the worker too.

import { LAKE, lakeTable, query } from "@/lib/services/duckdb";

const METADATA = `"__ducklake_metadata_${LAKE}"."ducklake"`;
/** Keys of a snapshot's `changes` map that mean a table's rows changed. */
const DATA_CHANGES = ["tables_inserted_into", "tables_deleted_from", "inlined_insert", "inlined_delete"];

export interface TableVersionMeta {
  version: number;
  created_at: string;
  job_id?: string;
  files: number;
  bytes: number;
  /** True for the version readers are currently scanning. */
  live: boolean;
}

function lit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Snapshots that changed the table's rows, newest first. */
async function dataSnapshots(
  slug: string,
  tableId: string,
): Promise<{ version: number; created_at: string; job_id?: string }[]> {
  const keys = DATA_CHANGES.map(lit).join(", ");
  const rows = await query<{ snapshot_id: number; ms: number; commit_message: string | null }>(
    `WITH t AS (
       SELECT t.table_id::VARCHAR AS id
       FROM ${METADATA}.ducklake_table t JOIN ${METADATA}.ducklake_schema s USING (schema_id)
       WHERE s.schema_name = ? AND t.table_name = ? AND t.end_snapshot IS NULL AND s.end_snapshot IS NULL
     )
     SELECT snapshot_id, epoch_ms(snapshot_time) AS ms, commit_message
     FROM ${LAKE}.snapshots(), t
     WHERE list_contains(flatten(list_transform([${keys}], k -> coalesce(changes[k], []))), t.id)
     ORDER BY snapshot_id DESC`,
    [slug, tableId],
  );
  return rows.map((r) => {
    const job = /^job (.+)$/.exec(r.commit_message ?? "")?.[1];
    return {
      version: Number(r.snapshot_id),
      created_at: new Date(Number(r.ms)).toISOString(),
      ...(job ? { job_id: job } : {}),
    };
  });
}

/** The live version of a table, or null when no run has written it. */
export async function liveVersion(
  slug: string,
  tableId: string,
): Promise<{ version: number; created_at: string; files: number } | null> {
  const [latest] = await dataSnapshots(slug, tableId);
  if (!latest) return null;
  const [files] = await query<{ n: number }>(
    `SELECT count(*) AS n FROM ducklake_list_files(${lit(LAKE)}, ${lit(tableId)}, schema => ${lit(slug)})`,
  );
  return { version: latest.version, created_at: latest.created_at, files: Number(files?.n ?? 0) };
}

/** Rows in the live table. */
export async function liveRowCount(slug: string, tableId: string): Promise<number> {
  const [row] = await query<{ n: number }>(`SELECT count(*) AS n FROM ${lakeTable(slug, tableId)}`);
  return Number(row?.n ?? 0);
}

/** Retained versions, newest first, with the files and bytes each reads. */
export async function listTableVersions(slug: string, tableId: string): Promise<TableVersionMeta[]> {
  const snapshots = await dataSnapshots(slug, tableId);
  return Promise.all(
    snapshots.map(async (s, i) => {
      const [stats] = await query<{ files: number; bytes: number | null }>(
        `SELECT count(*) AS files, sum(data_file_size_bytes) AS bytes
         FROM ducklake_list_files(${lit(LAKE)}, ${lit(tableId)}, schema => ${lit(slug)}, snapshot_version => ${s.version})`,
      );
      return {
        ...s,
        files: Number(stats?.files ?? 0),
        bytes: Number(stats?.bytes ?? 0),
        live: i === 0,
      };
    }),
  );
}

/**
 * Ask the worker to make an older version current. The worker holds the
 * pipeline's run lock while it does, so a restore cannot interleave with a
 * run; it answers 409 while a run holds the lock.
 */
export async function restoreTableVersion(
  slug: string,
  tableId: string,
  version: number,
  env: Record<string, string | undefined> = process.env,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${env.WORKER_URL ?? "http://worker:8080"}/tables/restore`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.KARET_WORKER_TOKEN ?? ""}`,
    },
    body: JSON.stringify({ pipeline: slug, table: tableId, version }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    version?: number;
    error?: { kind?: string; message?: string };
  };
  if (res.ok && body.ok) return { status: 200, body: { ok: true, version: body.version, restoredFrom: version } };
  return {
    status: res.status === 404 || res.status === 409 ? res.status : 502,
    body: { error: body.error?.kind ?? "restore_failed", message: body.error?.message ?? `worker answered ${res.status}` },
  };
}
