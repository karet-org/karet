// Unit tests for `disconnectEdgeInConfig`.
//
// The helper clears the config field that produced a given edge in the
// Data Flow Graph:
//   - source_container → mapping : clears `mapping.source_container_id`
//   - mapping → analytic_table   : clears `mapping.analytic_table_id`
//
// Lookup → mapping edges are derived from `lookup_ref` AST nodes inside
// mapping columns and cannot be disconnected by this helper; the config is
// returned unchanged.

import { describe, expect, it } from "vitest";
import type { PipelineConfig } from "@/lib/types/config";
import { disconnectEdgeInConfig } from "../nodeDefaults";

function baseConfig(): PipelineConfig {
  return {
    version: 1,
    source_containers: [
      { id: "src1", name: "Src", path_prefix: "raw/", schema: [] },
    ],
    lookup_mappings: [
      {
        id: "lkp1",
        name: "Lkp",
        match: "keyword_substring",
        case_insensitive: true,
        rows: [],
        children: [],
      },
    ],
    mappings: [
      {
        id: "map1",
        name: "Map",
        source_container_id: "src1",
        analytic_table_id: "tbl1",
        columns: [
          {
            name: "c",
            expr: {
              kind: "lookup_ref",
              lookup_id: "lkp1",
              input: { kind: "col", name: "x" },
            },
          },
        ],
      },
    ],
    analytic_tables: [
      {
        id: "tbl1",
        name: "Tbl",
        schema: [{ name: "c", type: "string" }],
      },
    ],
  };
}

describe("disconnectEdgeInConfig", () => {
  it("clears source_container_id for a source→mapping edge", () => {
    const cfg = baseConfig();
    const updated = disconnectEdgeInConfig(cfg, "src1", "map1");
    expect(updated).not.toBe(cfg);
    expect(updated.mappings[0].source_container_id).toBe("");
    // Other fields are untouched.
    expect(updated.mappings[0].analytic_table_id).toBe("tbl1");
    expect(updated.source_containers).toBe(cfg.source_containers);
  });

  it("clears analytic_table_id and empties columns for a mapping→table edge", () => {
    const cfg = baseConfig();
    const updated = disconnectEdgeInConfig(cfg, "map1", "tbl1");
    expect(updated).not.toBe(cfg);
    expect(updated.mappings[0].analytic_table_id).toBe("");
    // Columns mirror the table schema; once detached the mapping has
    // nothing to produce, so the list is emptied.
    expect(updated.mappings[0].columns).toEqual([]);
    expect(updated.mappings[0].source_container_id).toBe("src1");
  });

  it("returns the config unchanged for a lookup→mapping edge", () => {
    const cfg = baseConfig();
    const updated = disconnectEdgeInConfig(cfg, "lkp1", "map1");
    expect(updated).toBe(cfg);
  });

  it("returns the config unchanged for an unknown edge", () => {
    const cfg = baseConfig();
    const updated = disconnectEdgeInConfig(cfg, "nope", "map1");
    expect(updated).toBe(cfg);
  });

  it("does not touch mappings whose ids do not match", () => {
    const cfg: PipelineConfig = {
      ...baseConfig(),
      mappings: [
        ...baseConfig().mappings,
        {
          id: "map2",
          name: "Map2",
          source_container_id: "src1",
          analytic_table_id: "tbl1",
          columns: [],
        },
      ],
    };
    const updated = disconnectEdgeInConfig(cfg, "src1", "map1");
    const m1 = updated.mappings.find((m) => m.id === "map1")!;
    const m2 = updated.mappings.find((m) => m.id === "map2")!;
    expect(m1.source_container_id).toBe("");
    expect(m2.source_container_id).toBe("src1");
  });
});
