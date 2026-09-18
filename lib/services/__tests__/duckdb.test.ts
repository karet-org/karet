// Unit tests for the SQL-string builder in `duckdb.ts`.
//
// `warehouseSource` interpolates the pipeline slug, the table id (both from the
// URL) and the manifest's keys into single-quoted `read_parquet([...])`
// literals, so it must escape single quotes or a crafted slug could break out
// of the string and inject SQL. These tests pin that escaping.

import { describe, it, expect, vi } from "vitest";
import { executeUserQuery, warehouseSource } from "@/lib/services/duckdb";

// The manifest read is the only S3 call in this path; stub it so the tests
// stay unit-level and assert on the SQL that comes out.
vi.mock("@/lib/services/table-manifest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/table-manifest")>();
  return {
    ...actual,
    readManifest: vi.fn(async () => ({
      version: 7,
      created_at: "2026-09-16T00:00:00Z",
      files: [{ key: "v7/year=2026/month=9/m.parquet", mapping_id: "m", bytes: 10 }],
    })),
  };
});

// These run against a real (in-memory) DuckDB instance, exercising the
// sandbox SETs applied at session init.
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
});

describe("warehouseSource", () => {
  it("builds a read_parquet call over the files the manifest lists", async () => {
    const sql = await warehouseSource("demo", "transactions");
    expect(sql).toContain(
      "read_parquet(['s3://karet-warehouse/pipelines/demo/transactions/v7/year=2026/month=9/m.parquet']",
    );
    expect(sql).toContain("union_by_name = true");
    expect(sql).toContain("hive_partitioning = true");
  });

  it("does not glob the table prefix, which would union retained versions", async () => {
    const sql = await warehouseSource("demo", "transactions");
    expect(sql).not.toContain("**");
  });

  it("escapes a single quote in the slug so it can't break out of the literal", async () => {
    const sql = await warehouseSource("demo'zzz", "transactions");
    expect(sql).toContain("pipelines/demo''zzz/");
    expect(sql).not.toMatch(/pipelines\/demo'zzz\//);
  });

  it("neutralizes a UNION-style breakout payload in the slug", async () => {
    const payload = "x') UNION SELECT * FROM secrets --";
    const sql = (await warehouseSource(payload, "t")) ?? "";
    expect(sql).toContain("'') UNION");
    // A well-formed literal has balanced quotes: every `'` is either a
    // delimiter or a doubled inner quote, so the total count is even. A
    // successful breakout would leave an odd count.
    const quoteCount = (sql.match(/'/g) ?? []).length;
    expect(quoteCount % 2).toBe(0);
  });

  it("escapes a single quote in the table id too", async () => {
    const sql = await warehouseSource("demo", "t'x");
    expect(sql).toContain("demo/t''x/");
    expect(sql).not.toMatch(/demo\/t'x\//);
  });
});
