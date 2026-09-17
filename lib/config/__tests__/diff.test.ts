// The config diff exists because a textual one is useless here: the editor
// rebuilds objects on every edit, so key order moves and layout drifts.

import { describe, expect, it } from "vitest";
import { diffConfigs, summarizeDiff } from "../diff";
import type { PipelineConfig } from "@/lib/types/config";

function base(): PipelineConfig {
  return {
    version: 1,
    name: "Demo",
    source_containers: [
      { id: "raw", name: "Raw", path_prefix: "p/", schema: [{ name: "a", type: "string" }] },
    ],
    dimensions: [],
    mappings: [
      {
        id: "m1",
        name: "Mapping",
        source_container_id: "raw",
        analytic_table_id: "t1",
        columns: [{ name: "a", expr: { kind: "col", name: "a" } }],
      },
    ],
    analytic_tables: [{ id: "t1", name: "Table", schema: [{ name: "a", type: "string" }] }],
    layout: { raw: { x: 0, y: 0 } },
  } as unknown as PipelineConfig;
}

describe("diffConfigs", () => {
  it("reports nothing when the configs match", () => {
    expect(diffConfigs(base(), base())).toEqual({ changes: [], onlyLayout: true });
  });

  it("ignores layout, because dragging a node is not a change to the pipeline", () => {
    const after = base();
    after.layout = { raw: { x: 400, y: 120.333 } };
    const diff = diffConfigs(base(), after);
    expect(diff.changes).toEqual([]);
    expect(diff.onlyLayout).toBe(true);
    expect(summarizeDiff(diff)).toBe("layout only");
  });

  it("ignores key order, because the editor rebuilds objects on every edit", () => {
    const after = base();
    after.mappings[0] = {
      analytic_table_id: "t1",
      columns: [{ expr: { name: "a", kind: "col" }, name: "a" }],
      source_container_id: "raw",
      name: "Mapping",
      id: "m1",
    } as unknown as PipelineConfig["mappings"][number];
    expect(diffConfigs(base(), after).changes).toEqual([]);
  });

  it("names an added entity", () => {
    const after = base();
    after.dimensions.push({
      id: "cats",
      name: "Categories",
      rows: { values: ["category"], rows: [] },
    } as unknown as PipelineConfig["dimensions"][number]);
    expect(diffConfigs(base(), after).changes).toEqual([
      { kind: "added", entity: "Dimension", id: "cats", name: "Categories" },
    ]);
  });

  it("names a removed entity", () => {
    const after = base();
    after.mappings = [];
    expect(diffConfigs(base(), after).changes).toEqual([
      { kind: "removed", entity: "Mapping", id: "m1", name: "Mapping" },
    ]);
  });

  it("says which fields changed", () => {
    const after = base();
    after.mappings[0].columns.push({ name: "b", expr: { kind: "col", name: "b" } } as never);
    after.mappings[0].where = { kind: "col", name: "keep" } as never;
    const diff = diffConfigs(base(), after);
    expect(diff.changes).toHaveLength(1);
    expect(diff.changes[0]).toMatchObject({ kind: "changed", entity: "Mapping", id: "m1" });
    expect(diff.changes[0].fields).toEqual(["columns", "where"]);
  });

  it("notices a rename of the pipeline itself", () => {
    const after = base();
    after.name = "Renamed";
    expect(diffConfigs(base(), after).changes).toEqual([
      { kind: "changed", entity: "Pipeline", id: "name", name: "Renamed", fields: ["name"] },
    ]);
  });

  it("summarizes counts by kind", () => {
    const after = base();
    after.source_containers.push({ id: "raw2", name: "Raw 2", path_prefix: "q/", schema: [] } as never);
    after.mappings = [];
    after.name = "Renamed";
    expect(summarizeDiff(diffConfigs(base(), after))).toBe("1 added, 1 removed, 1 changed");
  });

  it("handles a missing side without pretending everything changed", () => {
    expect(diffConfigs(null, base())).toEqual({ changes: [], onlyLayout: false });
    expect(diffConfigs(base(), null)).toEqual({ changes: [], onlyLayout: false });
  });
});
