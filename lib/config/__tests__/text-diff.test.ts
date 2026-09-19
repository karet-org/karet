// The unified config diff.
//
// Two properties matter more than the diff algorithm, which is the library's:
// key order must not register as a change, because the editor rebuilds objects on
// every edit, and node positions must not either, because dragging a node is not
// a change to the pipeline.

import { describe, expect, it } from "vitest";
import { canonicalJson, unifiedConfigDiff } from "../text-diff";
import type { PipelineConfig } from "@/lib/types/config";

function config(overrides: Partial<PipelineConfig> = {}): PipelineConfig {
  return {
    version: 1,
    name: "Demo",
    source_containers: [
      { id: "raw", name: "Raw", path_prefix: "lake/raw/", schema: [{ name: "a", type: "string" }] },
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
    ...overrides,
  } as PipelineConfig;
}

/** Every line that would be shown as changed, with its marker. */
function changedLines(diff: ReturnType<typeof unifiedConfigDiff>): string[] {
  return diff.hunks.flatMap((h) =>
    h.lines
      .filter((l) => l.kind !== "context")
      .map((l) => `${l.kind === "added" ? "+" : "-"}${l.text.trim()}`),
  );
}

describe("canonicalJson", () => {
  it("sorts keys at every level", () => {
    const a = canonicalJson({ b: 1, a: { d: 2, c: 3 } });
    const b = canonicalJson({ a: { c: 3, d: 2 }, b: 1 });
    expect(a).toBe(b);
  });

  it("drops layout, which is not part of what a pipeline does", () => {
    expect(canonicalJson({ name: "x", layout: { n: { x: 1, y: 2 } } })).not.toContain("layout");
  });

  it("keeps array order, which is meaningful", () => {
    // Mapping and column order affect the output, so this is not noise.
    expect(canonicalJson({ xs: [2, 1] })).not.toBe(canonicalJson({ xs: [1, 2] }));
  });
});

describe("unifiedConfigDiff", () => {
  it("reports identical for the same config", () => {
    const diff = unifiedConfigDiff(config(), config());
    expect(diff.identical).toBe(true);
    expect(diff.hunks).toEqual([]);
  });

  it("ignores reordered keys", () => {
    const after = config();
    after.mappings[0] = {
      analytic_table_id: "t1",
      columns: [{ expr: { name: "a", kind: "col" }, name: "a" }],
      source_container_id: "raw",
      name: "Mapping",
      id: "m1",
    } as unknown as PipelineConfig["mappings"][number];
    expect(unifiedConfigDiff(config(), after).identical).toBe(true);
  });

  it("ignores node positions", () => {
    const after = config({ layout: { raw: { x: 940, y: 121.33333 } } } as Partial<PipelineConfig>);
    expect(unifiedConfigDiff(config(), after).identical).toBe(true);
  });

  it("shows a renamed pipeline as one line replaced", () => {
    const diff = unifiedConfigDiff(config(), config({ name: "Renamed" }));
    expect(diff.identical).toBe(false);
    expect(diff.additions).toBe(1);
    expect(diff.deletions).toBe(1);
    expect(changedLines(diff)).toEqual(['-"name": "Demo",', '+"name": "Renamed",']);
  });

  it("shows an added column as additions only", () => {
    const after = config();
    after.mappings[0].columns.push({
      name: "b",
      expr: { kind: "col", name: "b" },
    } as never);
    const diff = unifiedConfigDiff(config(), after);
    expect(diff.deletions).toBe(0);
    expect(diff.additions).toBeGreaterThan(0);
    expect(changedLines(diff).some((l) => l.includes('"name": "b"'))).toBe(true);
  });

  it("reads from live to the inspected version, so restoring is the direction", () => {
    // Live has the filter; the old version does not. Restoring would remove it,
    // so the filter lines must appear as deletions.
    const live = config();
    live.mappings[0].where = { kind: "col", name: "keep" } as never;
    const diff = unifiedConfigDiff(live, config());
    expect(changedLines(diff).some((l) => l.startsWith("-") && l.includes("where"))).toBe(true);
    expect(changedLines(diff).some((l) => l.startsWith("+") && l.includes("where"))).toBe(false);
  });

  it("emits hunk headers in unified-diff form", () => {
    const diff = unifiedConfigDiff(config(), config({ name: "Renamed" }));
    expect(diff.hunks[0].header).toMatch(/^@@ -\d+,\d+ \+\d+,\d+ @@$/);
  });

  it("gives context lines around a change", () => {
    const diff = unifiedConfigDiff(config(), config({ name: "Renamed" }));
    expect(diff.hunks[0].lines.some((l) => l.kind === "context")).toBe(true);
  });

  it("handles a missing side without inventing a diff", () => {
    expect(unifiedConfigDiff(null, config()).hunks).toEqual([]);
    expect(unifiedConfigDiff(config(), null).identical).toBe(false);
  });
});
