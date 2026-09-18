// The control-plane database.
//
// Postgres holds what needs constraints, indexes and transactions: accounts,
// sessions, the pipeline registry, config versions and job history. The lake,
// the warehouse and the documents people edit as text stay in S3, so a bucket
// sync is still a complete, portable dataset.
//
// Node runtime only. Edge code (middleware) must not import this.

import { Pool, type PoolClient, type QueryResultRow } from "pg";

let pool: Pool | null = null;

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url || url.length === 0) {
    throw new Error(
      "DATABASE_URL is not set. Point it at Postgres, e.g. " +
        "postgres://karet:karet@postgres:5432/karet",
    );
  }
  return url;
}

/**
 * The shared pool. Small on purpose: Next runs one process per container and
 * queries here are short control-plane reads, not analytics (that is DuckDB
 * over S3), so a large pool would only hold connections open.
 */
export function db(): Pool {
  if (pool) return pool;
  pool = new Pool({
    connectionString: databaseUrl(),
    max: Number(process.env.DATABASE_POOL_MAX) || 8,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  // Without this an idle-client error becomes an unhandled rejection and takes
  // the process down; Postgres restarting under us is not fatal.
  pool.on("error", (err) => {
    console.error("postgres idle client error:", err.message);
  });
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  values: unknown[] = [],
): Promise<T[]> {
  const result = await db().query<T>(sql, values as never[]);
  return result.rows;
}

/** First row, or null. */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  values: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, values);
  return rows[0] ?? null;
}

/**
 * Run `fn` inside a transaction, rolling back on throw.
 *
 * Used where two writes have to land together: a config version plus the
 * pointer that makes it live, for instance, where a half-applied save would
 * leave a pipeline referencing a version that does not exist.
 */
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** True when the database answers. Used by the health check and startup. */
export async function ping(): Promise<boolean> {
  try {
    await query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
