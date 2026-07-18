// Unit tests for the SQL-string builder in `duckdb.ts`.
//
// `warehouseSource` interpolates the pipeline slug and table id (both from the
// URL) into a single-quoted `read_parquet('s3://...')` literal, so it must
// escape single quotes or a crafted slug could break out of the string and
// inject SQL. These tests pin that escaping.

import { describe, it, expect } from "vitest";
import { warehouseSource } from "@/lib/services/duckdb";

describe("warehouseSource", () => {
  it("builds a read_parquet call over the table's warehouse prefix", () => {
    const sql = warehouseSource("demo", "transactions");
    expect(sql).toContain(
      "read_parquet('s3://karet-warehouse/pipelines/demo/transactions/**/*.parquet'",
    );
    expect(sql).toContain("union_by_name = true");
    expect(sql).toContain("hive_partitioning = true");
  });

  it("escapes a single quote in the slug so it can't break out of the literal", () => {
    const sql = warehouseSource("demo'zzz", "transactions");
    // The lone quote must be doubled, never left bare.
    expect(sql).toContain("pipelines/demo''zzz/");
    expect(sql).not.toMatch(/pipelines\/demo'zzz\//);
  });

  it("neutralizes a UNION-style breakout payload in the slug", () => {
    const payload = "x/**/*.parquet') UNION SELECT * FROM secrets --";
    const sql = warehouseSource(payload, "t");
    // The payload's quote is doubled, so the UNION lands inside the string
    // literal rather than escaping it as SQL.
    expect(sql).toContain("'') UNION");
    // A well-formed literal has balanced quotes: every `'` is either the
    // opening/closing delimiter or a doubled inner quote, so the total count
    // is even. A successful breakout would leave an odd count.
    const quoteCount = (sql.match(/'/g) ?? []).length;
    expect(quoteCount % 2).toBe(0);
  });

  it("escapes a single quote in the table id too", () => {
    const sql = warehouseSource("demo", "t'x");
    expect(sql).toContain("demo/t''x/");
    expect(sql).not.toMatch(/demo\/t'x\//);
  });
});
