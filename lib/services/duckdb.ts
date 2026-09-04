// Server-side Parquet querying over S3 via DuckDB (httpfs).
//
// A single in-memory database is shared across requests; every query reads
// straight from the warehouse bucket, so there's no local state to manage.

import type * as duckdb from "duckdb";
import { loadS3Config } from "@/lib/config/s3-client";

let db: duckdb.Database | null = null;

/** Lazily open the shared database and point httpfs at the S3 endpoint. */
function getDb(): duckdb.Database {
  if (db) return db;
  // Required, not imported, so the native addon only loads on first use
  // (never at build time or during page-data collection).
  const { Database } = require("duckdb") as typeof duckdb;
  db = new Database(":memory:");

  const config = loadS3Config();

  // DuckDB installs/caches the httpfs extension under its home directory.
  // Point it at a writable path (the container user's home may be unset).
  const home = process.env.DUCKDB_HOME || process.env.HOME || "/tmp";

  const stmts = [
    `SET home_directory = '${home}'`,
    `SET extension_directory = '${home}/.duckdb/extensions'`,
    `INSTALL httpfs`,
    `LOAD httpfs`,
    `SET s3_region = '${config.region}'`,
    `SET s3_access_key_id = '${process.env.AWS_ACCESS_KEY_ID ?? ""}'`,
    `SET s3_secret_access_key = '${process.env.AWS_SECRET_ACCESS_KEY ?? ""}'`,
    `SET s3_url_style = 'path'`,
    ...(config.endpoint
      ? [
          `SET s3_endpoint = '${config.endpoint.replace(/^https?:\/\//, "")}'`,
          `SET s3_use_ssl = ${config.endpoint.startsWith("https") ? "true" : "false"}`,
        ]
      : []),
    // ---- Sandbox. User SQL from /api/p/[pipeline]/query runs on this
    // session, so lock it down after httpfs is installed and loaded
    // (INSTALL/LOAD themselves need local-filesystem access).
    //
    // Local reads are off: without this, any SELECT can call
    // read_text('/proc/self/environ') or read csv/parquet from disk.
    // httpfs (s3://) is unaffected.
    `SET disabled_filesystems = 'LocalFileSystem'`,
    // Bound a runaway query instead of letting it OOM the web process.
    `SET memory_limit = '${process.env.DUCKDB_MEMORY_LIMIT || "512MB"}'`,
    // Must be last: freezes every setting above (including the S3
    // credentials and the two limits) so user SQL cannot SET, RESET, or
    // re-enable anything.
    `SET lock_configuration = true`,
  ];

  for (const stmt of stmts) {
    db.exec(stmt);
  }

  return db;
}

/** Coerce a DuckDB value into a JSON-serializable one (BigInt -> Number). */
function toJson(value: unknown): unknown {
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Date) return value.toISOString();
  return value;
}

/** Run a read-only query and return the rows as JSON-safe plain objects. */
export function query<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    getDb().all(sql, (err: Error | null, rows: duckdb.TableData) => {
      if (err) return reject(err);
      const safe = (rows ?? []).map((row) => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) out[k] = toJson(v);
        return out;
      });
      resolve(safe as T[]);
    });
  });
}

/** Escape a value for embedding in a single-quoted SQL string literal. */
function sqlLit(value: string): string {
  return value.replace(/'/g, "''");
}

/** A `read_parquet(...)` table function over a table's warehouse prefix. */
export function warehouseSource(slug: string, tableId: string): string {
  const config = loadS3Config();
  const glob = `s3://${config.warehouseBucket}/${config.pipelinesPrefix}${slug}/${tableId}/**/*.parquet`;
  // `slug` and `tableId` come from the URL, so escape the single-quoted glob
  // to prevent breaking out of the string literal (SQL injection).
  return `read_parquet('${sqlLit(glob)}', union_by_name = true, hive_partitioning = true)`;
}

/** Load a table's rows, or `[]` when it has no Parquet output yet. */
export async function loadTableRowsDuckDB<T extends Record<string, unknown>>(
  slug: string,
  tableId: string,
): Promise<T[]> {
  try {
    return await query<T>(`SELECT * FROM ${warehouseSource(slug, tableId)}`);
  } catch (err) {
    // An empty glob surfaces as one of these errors; treat as no rows.
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes("No files found") ||
      msg.includes("HTTP Error") ||
      msg.includes("Could not read")
    ) {
      return [];
    }
    throw err;
  }
}

/**
 * Verify `sql` is a single read-only SELECT. DuckDB's `json_serialize_sql`
 * only serializes SELECT statements (and rejects multiple statements), so a
 * clean parse is proof the query neither writes nor runs a second statement.
 * Returns an error message when it isn't, or `null` when it's safe to run.
 */
async function checkReadOnly(sql: string): Promise<string | null> {
  const escaped = sql.replace(/'/g, "''");
  let rows: { ast: string }[];
  try {
    rows = await query<{ ast: string }>(
      `SELECT json_serialize_sql('${escaped}') AS ast`,
    );
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  const parsed = JSON.parse(rows[0]?.ast ?? "{}") as { error?: boolean };
  return parsed.error ? "Only SELECT queries are allowed" : null;
}

/**
 * A queryable relation: the identifier the user types (`slug`) and the
 * `read_parquet(...)` expression it maps to over a warehouse table.
 */
export interface QueryRelation {
  slug: string;
  source: string;
}

/**
 * Run a user's read-only SELECT against the pipeline's warehouse tables.
 *
 * Each referenced relation is inlined as a CTE over its reader expression,
 * then the user's query runs as a subquery against them. Only referenced
 * relations are read, and no server-side state (views) is created, so
 * concurrent queries for different pipelines can't collide.
 */
export async function executeUserQuery(
  relations: QueryRelation[],
  sql: string,
  options: { validateOnly?: boolean } = {},
): Promise<{ columns: string[]; rows: Record<string, unknown>[] } | { error: string }> {
  const readOnlyError = await checkReadOnly(sql);
  if (readOnlyError) return { error: readOnlyError };

  // Inline only the relations the query names. Matching on a word boundary is
  // deliberately loose: an unused match just adds a CTE the query ignores.
  const referenced = relations.filter((r) =>
    new RegExp(`\\b${r.slug}\\b`, "i").test(sql),
  );
  const ctes = referenced.map(
    (r) => `"${r.slug}" AS (SELECT * FROM ${r.source})`,
  );
  const prefix = ctes.length > 0 ? `WITH ${ctes.join(", ")} ` : "";
  // In validate-only mode we still bind and plan the query (so bad syntax,
  // missing tables, and unknown columns all surface), but `LIMIT 0` means no
  // rows are scanned, which is cheap even against a large warehouse.
  const wrapped = options.validateOnly
    ? `${prefix}SELECT * FROM (${sql}) LIMIT 0`
    : prefix
      ? `${prefix}SELECT * FROM (${sql})`
      : sql;

  try {
    const rows = await query<Record<string, unknown>>(wrapped);
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    return { columns, rows };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
