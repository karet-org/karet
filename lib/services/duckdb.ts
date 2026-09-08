// Server-side Parquet querying over S3 via DuckDB (httpfs). One in-memory
// database is shared across requests; queries read straight from S3.

import type { DuckDBConnection } from "@duckdb/node-api";
import { loadS3Config } from "@/lib/config/s3-client";

let conn: DuckDBConnection | null = null;
let initializing: Promise<DuckDBConnection> | null = null;

/**
 * Lazily open the shared connection, point httpfs at S3, and apply the
 * sandbox. The handle is published only after every statement succeeds: user
 * SQL runs on this session, so a half-initialized (unsandboxed) session must
 * never be cached.
 */
function getConn(): Promise<DuckDBConnection> {
  if (conn) return Promise.resolve(conn);
  if (initializing) return initializing;

  initializing = (async () => {
    // Required, not imported, so the native addon only loads on first use
    // (never at build time or during page-data collection).
    const { DuckDBInstance } =
      require("@duckdb/node-api") as typeof import("@duckdb/node-api");
    const instance = await DuckDBInstance.create(":memory:");
    const candidate = await instance.connect();

    const config = loadS3Config();

    // httpfs is cached under DuckDB's home directory; the container user's
    // home may be unset, so point it at a writable path.
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
      // DuckDB >=1.4 lazily initializes persistent secret storage on the
      // local filesystem at first S3 access; with LocalFileSystem disabled
      // that init fails and takes every s3:// read down with it. In-memory
      // secrets only — also keeps credentials off disk.
      `SET allow_persistent_secrets = false`,
      // Sandbox: user SQL runs on this session, so lock it down after
      // INSTALL/LOAD (which themselves need local-filesystem access).
      // Without this, any SELECT can read_text('/proc/self/environ') or read
      // local csv/parquet; httpfs (s3://) is unaffected.
      `SET disabled_filesystems = 'LocalFileSystem'`,
      // Bound a runaway query instead of letting it OOM the web process.
      `SET memory_limit = '${process.env.DUCKDB_MEMORY_LIMIT || "512MB"}'`,
      // Session is shared by every dashboard and ad-hoc query; don't let one
      // hot query monopolize the container's cores.
      `SET threads = ${Number(process.env.DUCKDB_THREADS) > 0 ? Number(process.env.DUCKDB_THREADS) : 2}`,
      // Must be last: freezes every setting above (S3 credentials and limits)
      // so user SQL cannot SET, RESET, or re-enable anything.
      `SET lock_configuration = true`,
    ];

    for (const stmt of stmts) {
      await candidate.run(stmt);
    }

    conn = candidate;
    return candidate;
  })().finally(() => {
    initializing = null;
  });
  return initializing;
}

/** Coerce a DuckDB value into a JSON-serializable one (BigInt -> Number). */
function toJson(value: unknown): unknown {
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Date) return value.toISOString();
  return value;
}

/** Run a read-only query and return the rows as JSON-safe plain objects. */
async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  values: (string | null)[] = [],
): Promise<T[]> {
  const connection = await getConn();
  const reader = await connection.runAndReadAll(sql, values);
  return reader.getRowObjectsJS().map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) out[k] = toJson(v);
    return out;
  }) as T[];
}

/** Escape a value for embedding in a single-quoted SQL string literal. */
function sqlLit(value: string): string {
  return value.replace(/'/g, "''");
}

/** A `read_parquet(...)` table function over a table's warehouse prefix. */
export function warehouseSource(slug: string, tableId: string): string {
  const config = loadS3Config();
  const glob = `s3://${config.warehouseBucket}/${config.pipelinesPrefix}${slug}/${tableId}/**/*.parquet`;
  // `slug`/`tableId` come from the URL: escape the single-quoted glob so it
  // can't break out of the string literal (SQL injection).
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
 * Verify `sql` is a single read-only SELECT: `json_serialize_sql` only
 * serializes SELECTs and rejects multiple statements, so a clean parse proves
 * the query neither writes nor runs a second statement. Null when safe.
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

/** The identifier the user types (`slug`) and the `read_parquet(...)` expression it maps to. */
export interface QueryRelation {
  slug: string;
  source: string;
}

/**
 * Run a user's read-only SELECT against the pipeline's warehouse tables.
 * Referenced relations are inlined as CTEs rather than server-side views, so
 * concurrent queries for different pipelines can't collide.
 */
export async function executeUserQuery(
  relations: QueryRelation[],
  sql: string,
  options: { validateOnly?: boolean; values?: (string | null)[] } = {},
): Promise<{ columns: string[]; rows: Record<string, unknown>[] } | { error: string }> {
  // The read-only check runs on a NULL-substituted variant: `?` placeholders
  // are literal positions, so substitution can't change the statement's shape.
  const readOnlyError = await checkReadOnly(
    options.values?.length ? sql.replace(/\?/g, "NULL") : sql,
  );
  if (readOnlyError) return { error: readOnlyError };

  // Word-boundary matching is deliberately loose: an unused match just adds a
  // CTE the query ignores.
  const referenced = relations.filter((r) =>
    new RegExp(`\\b${r.slug}\\b`, "i").test(sql),
  );
  const ctes = referenced.map(
    (r) => `"${r.slug}" AS (SELECT * FROM ${r.source})`,
  );
  const prefix = ctes.length > 0 ? `WITH ${ctes.join(", ")} ` : "";
  // Validate-only still binds and plans the query (surfacing bad syntax and
  // unknown columns), but `LIMIT 0` scans no rows.
  const wrapped = options.validateOnly
    ? `${prefix}SELECT * FROM (${sql}) LIMIT 0`
    : prefix
      ? `${prefix}SELECT * FROM (${sql})`
      : sql;

  try {
    const rows = await query<Record<string, unknown>>(wrapped, options.values ?? []);
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    return { columns, rows };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Column names a SELECT would produce, without reading data. `sql` must be
 * parameter-free; DESCRIBE isn't a SELECT, so the read-only gate runs on the
 * inner query.
 */
export async function describeUserQuery(
  relations: QueryRelation[],
  sql: string,
): Promise<{ columns: string[] } | { error: string }> {
  const readOnlyError = await checkReadOnly(sql);
  if (readOnlyError) return { error: readOnlyError };
  const referenced = relations.filter((r) =>
    new RegExp(`\\b${r.slug}\\b`, "i").test(sql),
  );
  const ctes = referenced.map((r) => `"${r.slug}" AS (SELECT * FROM ${r.source})`);
  const prefix = ctes.length > 0 ? `WITH ${ctes.join(", ")} ` : "";
  try {
    const rows = await query<{ column_name: string }>(
      `DESCRIBE ${prefix}SELECT * FROM (${sql})`,
    );
    return { columns: rows.map((r) => String(r.column_name)) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
