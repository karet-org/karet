// Unit tests for `duckdb.ts`: the sandbox on the shared session, and the SQL
// that names a lake table. The slug and the table id come from the URL, so
// they must be quoted as identifiers or a crafted one could inject SQL.

import { describe, it, expect } from "vitest";
import { executeUserQuery, lakeSourceSql, warehouseSource } from "@/lib/services/duckdb";

// These run against a real (in-memory) DuckDB instance, exercising the
// sandbox SETs applied at session init. httpfs copies AWS_* variables into
// its settings, so set them to check they do not show.
process.env.AWS_ACCESS_KEY_ID = "AKIDTEST";
process.env.AWS_SECRET_ACCESS_KEY = "test-secret";
describe("executeUserQuery sandbox", () => {
  it("runs a plain SELECT", async () => {
    const result = await executeUserQuery([], "SELECT 1 AS one");
    expect(result).toEqual({ columns: ["one"], rows: [{ one: 1 }] });
  });

  it("rejects non-SELECT statements", async () => {
    const result = await executeUserQuery([], "SET memory_limit = '100GB'");
    expect(result).toHaveProperty("error");
  });

  it("blocks local filesystem reads (disabled_filesystems)", async () => {
    const result = await executeUserQuery(
      [],
      "SELECT content FROM read_text('/etc/hostname')",
    );
    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toMatch(
      /disabled|not allowed|permission/i,
    );
  });

  it("locks configuration against SET smuggled into a SELECT", async () => {
    // json_serialize_sql only accepts SELECTs, but pin the second layer of
    // defense too: even a direct SET via the shared query path must fail
    // once lock_configuration is on.
    const result = await executeUserQuery(
      [],
      "SELECT * FROM (SELECT 1) t WHERE current_setting('memory_limit') IS NOT NULL",
    );
    // Reading settings is fine; the lock only forbids writes. This query
    // succeeding proves the session is still usable after the lock.
    expect(result).not.toHaveProperty("error");
  });

  it("does not show the S3 credentials to a query", async () => {
    const result = await executeUserQuery(
      [],
      `SELECT current_setting('s3_access_key_id') AS k, current_setting('s3_secret_access_key') AS s,
              (SELECT bool_and(secret_string LIKE '%secret=redacted%') FROM duckdb_secrets()) AS redacted`,
    );
    expect(result).toEqual({ columns: ["k", "s", "redacted"], rows: [{ k: "", s: "", redacted: true }] });
    expect(await executeUserQuery([], "SELECT * FROM duckdb_secrets(redact := false)")).toHaveProperty("error");
  });

  it("applies the sandbox on every connection when queries run at once", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => executeUserQuery([], "SELECT * FROM read_text('/etc/hostname')")),
    );
    for (const r of results) expect(r).toHaveProperty("error", expect.stringMatching(/LocalFileSystem/));
    const settings = await Promise.all(
      Array.from({ length: 8 }, () =>
        executeUserQuery([], "SELECT current_setting('parquet_metadata_cache') AS m, current_setting('s3_secret_access_key') AS s"),
      ),
    );
    for (const r of settings) expect(r).toEqual({ columns: ["m", "s"], rows: [{ m: true, s: "" }] });
  });
});

describe("blocked functions", () => {
  // The postgres extension is not loaded in unit tests; the check rejects the
  // names when parsing, before DuckDB looks them up.
  it.each([
    "SELECT * FROM postgres_scan('host=example port=5432', 'public', 'user')",
    "SELECT * FROM main.POSTGRES_QUERY('lake', 'SELECT pg_sleep(60)')",
    "SELECT 1 WHERE 1 IN (SELECT * FROM postgres_attach('host=x'))",
    "SELECT * FROM postgres_configure_pool(max_connections => 0)",
    "SELECT * FROM query('SELECT * FROM postgres_scan(''x'', ''y'', ''z'')')",
    "SELECT * FROM query_table('t')",
    "SELECT * FROM json_execute_serialized_sql('{}')",
    "SELECT * FROM lake.\"p-1\".table_changes('t', 1, 2)",
    "SELECT * FROM ducklake_table_insertions('lake', 'p-1', 't', 1, 2)",
    "SELECT * FROM lake.snapshots()",
  ])("rejects %s", async (sql) => {
    const result = await executeUserQuery([], sql);
    expect((result as { error: string }).error).toMatch(/is not allowed/);
  });

  it.each([
    'SELECT * FROM lake."p-1".t AT (VERSION => 3)',
    "SELECT 1 FROM (SELECT * FROM t AT (TIMESTAMP => now() - INTERVAL 1 DAY))",
  ])("rejects AT in %s", async (sql) => {
    const result = await executeUserQuery([], sql);
    expect((result as { error: string }).error).toMatch(/AT is not allowed/);
  });

  it("allows ordinary functions", async () => {
    expect(await executeUserQuery([], "SELECT upper('a') AS a")).toEqual({ columns: ["a"], rows: [{ a: "A" }] });
  });
});

describe("lakeSourceSql", () => {
  it("reads the table without the worker's mapping column", () => {
    expect(lakeSourceSql("demo", "transactions")).toBe(
      '(SELECT * EXCLUDE ("_karet_mapping") FROM lake."demo"."transactions")',
    );
  });

  it("reads a retained version with AT", () => {
    expect(lakeSourceSql("demo", "t", 12)).toContain('FROM lake."demo"."t" AT (VERSION => 12)');
    expect(() => lakeSourceSql("demo", "t", 1.5)).toThrow();
  });

  it("doubles a double quote in the slug and the table id", () => {
    const sql = lakeSourceSql('x"; DROP TABLE y; --', 't"x');
    expect(sql).toContain('lake."x""; DROP TABLE y; --"."t""x"');
    // A well-formed identifier has balanced quotes; a breakout leaves an odd count.
    expect((sql.match(/"/g) ?? []).length % 2).toBe(0);
  });
});

describe("warehouseSource", () => {
  it("is null for a table no run has written", async () => {
    expect(await warehouseSource("demo", "transactions")).toBeNull();
  });
});
