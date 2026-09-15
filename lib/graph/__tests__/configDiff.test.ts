// Dirtiness is derived from the config, so these are the cases that decide
// whether the Save button lights up: a real edit must register, and an edit
// that has been undone must not — including when the undo leaves the object's
// keys in a different order, or a node a hair from where it started.

import { describe, expect, it } from "vitest";
import type { PipelineConfig } from "@/lib/types/config";
import { configFingerprint, configsDiffer } from "@/lib/graph/configDiff";

const BASE: PipelineConfig = {
  version: 1,
  name: "p",
  source_containers: [
    { id: "src", name: "Src", path_prefix: "src/", schema: [{ name: "a", type: "string" }] },
  ],
  dimensions: [],
  mappings: [
    {
      id: "m",
      name: "M",
      source_container_id: "src",
      analytic_table_id: "t",
      columns: [{ name: "a", expr: { kind: "col", name: "a" } }],
    },
  ],
  analytic_tables: [{ id: "t", name: "T", schema: [{ name: "a", type: "string" }] }],
  layout: { m: { x: 10, y: 20 } },
};

const clone = (cfg: PipelineConfig): PipelineConfig => JSON.parse(JSON.stringify(cfg));

describe("configsDiffer", () => {
  it("sees no change in an identical config", () => {
    expect(configsDiffer(BASE, clone(BASE))).toBe(false);
  });

  it("sees a real edit", () => {
    const next = clone(BASE);
    next.mappings[0].name = "Renamed";
    expect(configsDiffer(next, BASE)).toBe(true);
  });

  it("sees no change once an edit is undone", () => {
    const edited = clone(BASE);
    edited.mappings[0].name = "Renamed";
    expect(configsDiffer(edited, BASE)).toBe(true);
    edited.mappings[0].name = "M";
    expect(configsDiffer(edited, BASE)).toBe(false);
  });

  it("ignores key order, so adding and removing a field is not a change", () => {
    // The filter toggle drops `where` with a rest spread, which moves the
    // surviving keys; re-adding it puts `where` last.
    const withFilter = clone(BASE);
    withFilter.mappings[0] = {
      ...withFilter.mappings[0],
      where: { kind: "bool", value: true },
    };
    expect(configsDiffer(withFilter, BASE)).toBe(true);

    const { where: _drop, ...rest } = withFilter.mappings[0];
    const undone = clone(BASE);
    undone.mappings[0] = rest as PipelineConfig["mappings"][number];
    expect(configsDiffer(undone, BASE)).toBe(false);
  });

  it("ignores sub-pixel drift in node positions", () => {
    const nudged = clone(BASE);
    nudged.layout = { m: { x: 10.0004, y: 19.9998 } };
    expect(configsDiffer(nudged, BASE)).toBe(false);

    const moved = clone(BASE);
    moved.layout = { m: { x: 40, y: 20 } };
    expect(configsDiffer(moved, BASE)).toBe(true);
  });

  it("treats an absent field and an undefined one as the same", () => {
    const withUndefined = clone(BASE) as PipelineConfig & { rollups?: undefined };
    withUndefined.rollups = undefined;
    expect(configsDiffer(withUndefined, BASE)).toBe(false);
  });

  it("has no opinion before a config is loaded", () => {
    expect(configsDiffer(null, BASE)).toBe(false);
    expect(configsDiffer(BASE, null)).toBe(false);
    expect(configFingerprint(null)).toBe("");
  });
});
