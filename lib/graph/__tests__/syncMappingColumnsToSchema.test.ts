// Unit tests for `syncMappingColumnsToSchema`.
//
// Verifies that when an Analytic_Table's schema changes, mappings
// connected to it propagate the change correctly:
//   - new columns appear with a `null` placeholder expr,
//   - renamed columns keep their authored expr,
//   - removed columns are dropped.

import { describe, expect, it } from "vitest";
import type { AnalyticTable, Mapping } from "@/lib/types/config";
import { syncMappingColumnsToSchema } from "../nodeDefaults";

function mapping(columns: Mapping["columns"]): Mapping {
  return {
    id: "m1",
    name: "M",
    source_container_id: "src1",
    analytic_table_id: "tbl1",
    columns,
  };
}

const colExpr = (name: string) =>
  ({ kind: "col", name } as const);

function schema(...names: string[]): AnalyticTable["schema"] {
  return names.map((name) => ({ name, type: "string" }));
}

describe("syncMappingColumnsToSchema", () => {
  it("returns the mapping unchanged when nothing changed", () => {
    const m = mapping([
      { name: "a", expr: colExpr("a") },
      { name: "b", expr: colExpr("b") },
    ]);
    const next = syncMappingColumnsToSchema(m, schema("a", "b"), schema("a", "b"));
    expect(next.columns).toEqual(m.columns);
  });

  it("appends a null-expr column when one is added to the schema", () => {
    const m = mapping([{ name: "a", expr: colExpr("a") }]);
    const next = syncMappingColumnsToSchema(m, schema("a"), schema("a", "b"));
    expect(next.columns).toEqual([
      { name: "a", expr: colExpr("a") },
      { name: "b", expr: { kind: "null" } },
    ]);
  });

  it("drops columns that are removed from the schema", () => {
    const m = mapping([
      { name: "a", expr: colExpr("a") },
      { name: "b", expr: colExpr("b") },
    ]);
    const next = syncMappingColumnsToSchema(m, schema("a", "b"), schema("a"));
    expect(next.columns).toEqual([{ name: "a", expr: colExpr("a") }]);
  });

  it("preserves the authored expr when a column is renamed", () => {
    const m = mapping([
      { name: "a", expr: colExpr("a") },
      { name: "b", expr: colExpr("b_source") },
    ]);
    // Rename `b` -> `beta` at the same index. The authored expr must
    // survive; we don't replace the user's work just because they fixed
    // a typo.
    const next = syncMappingColumnsToSchema(
      m,
      schema("a", "b"),
      schema("a", "beta"),
    );
    expect(next.columns).toEqual([
      { name: "a", expr: colExpr("a") },
      { name: "beta", expr: colExpr("b_source") },
    ]);
  });

  it("treats a swap (delete-then-add at same index) as delete + add, not rename", () => {
    // `x` removed, `y` added; both names existed somewhere in the old
    // or new schema, so we must not preserve `x`'s expr as `y`'s.
    const m = mapping([
      { name: "a", expr: colExpr("a") },
      { name: "x", expr: colExpr("x_authored") },
    ]);
    const next = syncMappingColumnsToSchema(
      m,
      schema("a", "x"),
      schema("a", "x", "y"), // x stays, y is new
    );
    // x retained, y seeded null.
    expect(next.columns).toEqual([
      { name: "a", expr: colExpr("a") },
      { name: "x", expr: colExpr("x_authored") },
      { name: "y", expr: { kind: "null" } },
    ]);
  });

  it("mirrors the order of the new schema even when columns reorder", () => {
    // The mapping had `a, b`; the table now reorders to `b, a`. The
    // mapping should match the table's new order, with each expr
    // tracking its name.
    const m = mapping([
      { name: "a", expr: colExpr("a") },
      { name: "b", expr: colExpr("b") },
    ]);
    const next = syncMappingColumnsToSchema(m, schema("a", "b"), schema("b", "a"));
    expect(next.columns).toEqual([
      { name: "b", expr: colExpr("b") },
      { name: "a", expr: colExpr("a") },
    ]);
  });
});
