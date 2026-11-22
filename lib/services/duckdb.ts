// Server-side querying of the analytic tables via DuckDB. The tables are a
// DuckLake catalog in Postgres, attached read-only, with Parquet in S3. One
// in-memory database is shared across requests. A query runs on one of a few
// connections, since a connection runs one query at a time and a dashboard or
// two users would otherwise wait in line.

import type { DuckDBConnection } from "@duckdb/node-api";
import { loadS3Config } from "@/lib/config/s3-client";

/** Name the DuckLake catalog is attached under. */
export const LAKE = "lake";
/** The column naming the mapping that wrote a row; internal to the worker. */
const MAPPING_COLUMN = "_karet_mapping";

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

    // Unset only in unit tests: the server refuses to start without it.
    const lake = process.env.KARET_LAKE_READER_PASSWORD ? lakeConnection() : null;
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
        `KEY_ID ${lit(process.env.AWS_ACCESS_KEY_ID ?? "")}`,
        `SECRET ${lit(process.env.AWS_SECRET_ACCESS_KEY ?? "")}`,
        `REGION ${lit(config.region)}`,
        "URL_STYLE 'path'",
        ...(config.endpoint
          ? [
              `ENDPOINT ${lit(config.endpoint.replace(/^https?:\/\//, ""))}`,
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
      ...(lake ? lakeStatements(lake) : []),
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

/** The secret and the attach for the catalog. */
function lakeStatements(lake: ReturnType<typeof lakeConnection>): string[] {
  return [
    `INSTALL ducklake`,
    `LOAD ducklake`,
    `INSTALL postgres`,
    `LOAD postgres`,
    // The catalog, read-only twice over: the attach refuses writes, and the
    // role it connects as only has SELECT on the catalog tables. The role has
    // no grants in the control-plane database, so user SQL cannot read
    // accounts or configs through the attached metadata database.
    `CREATE SECRET karet_lake_pg (${[
      "TYPE postgres",
      `HOST ${lit(lake.host)}`,
      `PORT ${lake.port}`,
      `DATABASE ${lit(lake.database)}`,
      `USER ${lit(lake.user)}`,
      `PASSWORD ${lit(lake.password)}`,
    ].join(", ")})`,
    `ATTACH 'ducklake:postgres:' AS ${LAKE} (READ_ONLY, METADATA_SCHEMA 'ducklake', META_SECRET 'karet_lake_pg')`,
  ];
}

/** The Postgres server holding the catalog, and the read-only role. */
export function lakeConnection(env: Record<string, string | undefined> = process.env) {
  const url = new URL(env.DATABASE_URL ?? "postgres://localhost:5432/karet");
  return {
    host: url.hostname,
    port: Number(url.port) || 5432,
    database: env.LAKE_DATABASE || "karet_lake",
    user: env.KARET_LAKE_READER_USER || "karet_lake_reader",
    password: env.KARET_LAKE_READER_PASSWORD ?? "",
  };
}

/** Run a read-only query and return the rows as JSON-safe plain objects. */
export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
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

/** A single-quoted SQL string literal. */
export function lit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function ident(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** The DuckLake table holding a pipeline's analytic table. */
export function lakeTable(slug: string, tableId: string): string {
  return `${LAKE}.${ident(slug)}.${ident(tableId)}`;
}

/** True once a run has written the table. */
export async function lakeTableExists(slug: string, tableId: string): Promise<boolean> {
  const rows = await query(
    "SELECT 1 FROM duckdb_tables() WHERE database_name = ? AND schema_name = ? AND table_name = ?",
    [LAKE, slug, tableId],
  );
  return rows.length > 0;
}

/**
 * A subquery over the table's rows, live or as of a retained `version`, or
 * null when no run has written the table yet.
 */
export async function warehouseSource(
  slug: string,
  tableId: string,
  version?: number,
): Promise<string | null> {
  if (!(await lakeTableExists(slug, tableId))) return null;
  return lakeSourceSql(slug, tableId, version);
}

/** [`warehouseSource`] without the existence check. */
export function lakeSourceSql(slug: string, tableId: string, version?: number): string {
  if (version !== undefined && !Number.isInteger(version)) throw new Error("version must be an integer");
  const at = version === undefined ? "" : ` AT (VERSION => ${version})`;
  return `(SELECT * EXCLUDE (${ident(MAPPING_COLUMN)}) FROM ${lakeTable(slug, tableId)}${at})`;
}

/** Column names and DuckDB types of a source. */
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
  if (parsed.error) return "Only SELECT queries are allowed";
  const nodes = [...entries(parsed)];
  const blocked = nodes.find(([k, v]) => k === "function_name" && typeof v === "string" && isBlockedFunction(v));
  if (blocked) return `The function ${String(blocked[1]).toLowerCase()} is not allowed`;
  // The app adds `AT` itself for the `versions` option, outside this check.
  if (nodes.some(([k, v]) => k === "at_clause" && v !== null)) {
    return "AT is not allowed; read an older version with the versions option";
  }
  return null;
}

/**
 * Functions user SQL may not call. The postgres extension is loaded for the
 * lake catalog, and its functions would let a SELECT connect to any Postgres
 * server, create views other users see, or change the catalog's connection
 * pool. `query`, `query_table` and `json_execute_serialized_sql` run SQL given
 * as a string, which this check cannot see into. The DuckLake functions, the
 * change feed and `AT` read older snapshots, which still hold the tables of
 * deleted pipelines until those snapshots expire.
 */
const BLOCKED_FUNCTIONS = new Set([
  "query",
  "query_table",
  "json_execute_serialized_sql",
  "table_changes",
  "table_insertions",
  "table_deletions",
  "snapshots",
  "current_snapshot",
  "last_committed_snapshot",
  "table_info",
  "options",
]);

function isBlockedFunction(name: string): boolean {
  const n = name.toLowerCase();
  return n.startsWith("postgres_") || n.startsWith("ducklake_") || BLOCKED_FUNCTIONS.has(n);
}

/** Every key and value in a `json_serialize_sql` tree, at any depth. */
function* entries(node: unknown): Generator<[string, unknown]> {
  if (Array.isArray(node)) {
    for (const item of node) yield* entries(item);
  } else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      yield [key, value];
      yield* entries(value);
    }
  }
}

/** The identifier the user types (`slug`) and the subquery it maps to. */
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
