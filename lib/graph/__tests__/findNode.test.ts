import { describe, expect, it } from "vitest";
import { findNode, NODE_TYPE } from "../build";
import type { PipelineConfig } from "../../types/config";

const cfg: PipelineConfig = {
  version: 1,
  source_containers: [
    { id: "src1", name: "Src 1", path_prefix: "raw/", schema: [] },
  ],
  lookup_mappings: [
    {
      id: "lk1", name: "Lookup", match: "exact", case_insensitive: false,
      rows: [], children: [],
    },
  ],
  mappings: [
    {
      id: "map1", name: "M",
      source_container_id: "src1",
      analytic_table_id: "tbl1",
      columns: [{ name: "c", expr: { kind: "col", name: "x" } }],
    },
  ],
  analytic_tables: [
    { id: "tbl1", name: "Tbl", output_prefix: "clean/", schema: [] },
  ],
  layout: { src1: { x: 10, y: 20 } },
};

describe("findNode", () => {
  it("returns the source container node by id", () => {
    const n = findNode(cfg, "src1");
    expect(n?.id).toBe("src1");
    expect(n?.type).toBe(NODE_TYPE.sourceContainer);
    expect(n?.position).toEqual({ x: 10, y: 20 });
  });

  it("returns the lookup mapping node by id", () => {
    expect(findNode(cfg, "lk1")?.type).toBe(NODE_TYPE.lookupMapping);
  });

  it("returns the mapping node by id", () => {
    expect(findNode(cfg, "map1")?.type).toBe(NODE_TYPE.mapping);
  });

  it("returns the analytic table node by id", () => {
    expect(findNode(cfg, "tbl1")?.type).toBe(NODE_TYPE.analyticTable);
  });

  it("returns null when no entity matches", () => {
    expect(findNode(cfg, "missing")).toBeNull();
  });

  it("falls back to {0,0} position when no layout entry exists", () => {
    expect(findNode(cfg, "tbl1")?.position).toEqual({ x: 0, y: 0 });
  });
});
