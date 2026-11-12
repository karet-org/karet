// Server-side Parquet querying over S3 via DuckDB (httpfs). One in-memory
// database is shared across requests; queries read straight from S3. A query
// runs on one of a few connections, since a connection runs one query at a
// time and a dashboard or two users would otherwise wait in line.

import type { DuckDBConnection } from "@duckdb/node-api";
import { loadS3Config } from "@/lib/config/s3-client";
import { manifestUrls, readManifest } from "@/lib/services/table-manifest";

const POOL_SIZE = Number(process.env.DUCKDB_CONNECTIONS) > 0 ? Number(process.env.DUCKDB_CONNECTIONS) : 4;

let pool: DuckDBConnection[] | null = null;
let initializing: Promise<DuckDBConnection[]> | null = null;
const idle: DuckDBConnection[] = [];
const waiting: ((c: DuckDBConnection) => void)[] = [];

/**
 * Lazily open the database, point httpfs at S3, apply the sandbox, and open
 * the connections. The pool is published only after every statement
 * succeeds: user SQL runs on these sessions, so a half-initialized
 * (unsandboxed) one must never be used.
 *
 * Settings are GLOBAL so every connection sees them; a plain SET would apply
 * to the first connection only, and the lock below stops the others from
 * setting anything themselves.
 */
function getPool(): Promise<DuckDBConnection[]> {
  if (pool) return Promise.resolve(pool);
  if (initializing) return initializing;

  initializing = (async () => {
    // Imported here, not at module scope, so the native addon only loads on first
    // use and never at build time or during page-data collection.
    const { DuckDBInstance } = await import("@duckdb/node-api");
    const instance = await DuckDBInstance.create(":memory:");
    const candidate = await instance.connect();

    const config = loadS3Config();

    // httpfs is cached under DuckDB's home directory; the container user's
    // home may be unset, so point it at a writable path.
    const home = process.env.DUCKDB_HOME || process.env.HOME || "/tmp";

    const stmts = [
      `SET GLOBAL home_directory = '${home}'`,
      `SET GLOBAL extension_directory = '${home}/.duckdb/extensions'`,
      `INSTALL httpfs`,
      `LOAD httpfs`,
      // DuckDB >=1.4 lazily initializes persistent secret storage on the
      // local filesystem at first S3 access; with LocalFileSystem disabled
      // that init fails and takes every s3:// read down with it. In-memory
      // secrets only, which also keeps credentials off disk. Must come before
      // the secret is created.
      `SET GLOBAL allow_persistent_secrets = false`,
      // Credentials go in a secret, not in s3_* settings: a setting can be
      // read back by any query with current_setting(), and a secret's key is
      // shown redacted.
      `CREATE SECRET karet_s3 (${[
        "TYPE s3",
        `KEY_ID '${sqlLit(process.env.AWS_ACCESS_KEY_ID ?? "")}'`,
        `SECRET '${sqlLit(process.env.AWS_SECRET_ACCESS_KEY ?? "")}'`,
        `REGION '${sqlLit(config.region)}'`,
        "URL_STYLE 'path'",
        ...(config.endpoint
          ? [
              `ENDPOINT '${sqlLit(config.endpoint.replace(/^https?:\/\//, ""))}'`,
              `USE_SSL ${config.endpoint.startsWith("https") ? "true" : "false"}`,
            ]
          : []),
      ].join(", ")})`,
      // httpfs also copies AWS_* environment variables into the s3_* settings,
      // where current_setting() would show them. Blank them; the secret
      // above is what reads use.
      `SET GLOBAL s3_access_key_id = ''`,
      `SET GLOBAL s3_secret_access_key = ''`,
      `SET GLOBAL s3_session_token = ''`,
      // Table files never change once written (a new version gets new keys),
      // so their Parquet footers can be kept instead of fetched per query.
      `SET GLOBAL parquet_metadata_cache = true`,
      // Sandbox: user SQL runs on this session, so lock it down after
      // INSTALL/LOAD (which themselves need local-filesystem access).
      // Without this, any SELECT can read_text('/proc/self/environ') or read
      // local csv/parquet; httpfs (s3://) is unaffected.
      `SET GLOBAL disabled_filesystems = 'LocalFileSystem'`,
      // Bound a runaway query instead of letting it OOM the web process.
      `SET GLOBAL memory_limit = '${process.env.DUCKDB_MEMORY_LIMIT || "512MB"}'`,
      // Session is shared by every dashboard and ad-hoc query; don't let one
      // hot query monopolize the container's cores.
      `SET GLOBAL threads = ${Number(process.env.DUCKDB_THREADS) > 0 ? Number(process.env.DUCKDB_THREADS) : 2}`,
      // Must be last: freezes every setting above (filesystems and limits)
      // so user SQL cannot SET, RESET, or re-enable anything.
      `SET GLOBAL lock_configuration = true`,
    ];

    for (const stmt of stmts) {
      await candidate.run(stmt);
    }

    const connections = [candidate];
    while (connections.length < POOL_SIZE) connections.push(await instance.connect());
    idle.push(...connections);
    pool = connections;
    return connections;
  })().finally(() => {
    initializing = null;
  });
  return initializing;
}

async function acquire(): Promise<DuckDBConnection> {
  await getPool();
  const free = idle.pop();
  if (free) return free;
  return new Promise((resolve) => waiting.push(resolve));
}

function release(connection: DuckDBConnection) {
  const next = waiting.shift();
  if (next) next(connection);
  else idle.push(connection);
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
  const connection = await acquire();
  let reader;
  try {
    reader = await connection.runAndReadAll(sql, values);
  } finally {
    release(connection);
  }
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

/**
 * A `read_parquet(...)` table function over the files a table's manifest lists,
 * or null when the table has no published version yet.
 *
 * An explicit file list, not a glob over the table prefix: the prefix also
 * holds the versions the worker retains for rollback, so a glob would union
 * every version of every row.
 */
export async function warehouseSource(
  slug: string,
  tableId: string,
  version?: number,
): Promise<string | null> {
  const manifest = await readManifest(slug, tableId, version);
  if (!manifest || manifest.files.length === 0) return null;
  const urls = manifestUrls(slug, tableId, manifest);
  // `slug`/`tableId` reach here from the URL, and manifest keys from S3:
  // escape every literal so none can break out of the string (SQL injection).
  const list = urls.map((u) => `'${sqlLit(u)}'`).join(", ");
  return `read_parquet([${list}], union_by_name = true, hive_partitioning = true)`;
}

/**
 * True for errors that mean a manifest outlived the objects it names (vacuum
 * retired a version between resolving it and reading it).
 */
export function isVanishedFileError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("No files found") ||
    msg.includes("HTTP Error") ||
    msg.includes("Could not read")
  );
}

/** Rows in a `read_parquet(...)` source, from the Parquet footers. */
export async function countSource(source: string): Promise<number> {
  const rows = await query<{ n: number }>(`SELECT count(*) AS n FROM ${source}`);
  return Number(rows[0]?.n ?? 0);
}

/** Column names and DuckDB types of a `read_parquet(...)` source. */
export async function describeSource(
  source: string,
): Promise<{ name: string; type: string }[]> {
  const rows = await query<{ column_name: string; column_type: string }>(
    `DESCRIBE SELECT * FROM ${source}`,
  );
  return rows.map((r) => ({ name: String(r.column_name), type: String(r.column_type) }));
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
