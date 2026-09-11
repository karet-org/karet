// Legacy configs must load, not just fail softly: a pipeline written before
// Dimensions existed should open in the graph with its lookups shown as
// dimensions and its `lookup_ref`s pointing at them.

import { describe, expect, it } from "vitest";
import { needsUpgrade, normalizePipelineConfig } from "@/lib/config/migrate";
import { buildGraph } from "@/lib/graph/build";
import { isFileRows } from "@/lib/types/config";

/** A config in the pre-Dimension, pre-Rollup shape. */
const LEGACY = {
  version: 1,
  name: "Legacy",
  source_containers: [
    { id: "src", name: "Src", path_prefix: "src/", schema: [{ name: "a", type: "string" }] },
  ],
  lookup_mappings: [
    {
      id: "categories",
      name: "Categories",
      match: "keyword_substring",
      case_insensitive: true,
      rows: [
        { input_patterns: ["UBER"], output: "TRANSPORT" },
        { input_patterns: ["PAYROLL"], output: "INCOME", priority: 10 },
      ],
      children: [
        {
          id: "merchants",
          rows: [{ input_patterns: ["UBER"], output: "Uber" }],
          children: [],
        },
      ],
      catch_all: { output: "OTHER" },
    },
  ],
  mappings: [
    {
      id: "m",
      name: "M",
      source_container_id: "src",
      analytic_table_id: "t",
      columns: [
        {
          name: "category",
          expr: { kind: "lookup_ref", lookup_id: "categories", input: { kind: "col", name: "a" } },
        },
        {
          name: "merchant",
          expr: {
            kind: "coalesce",
            args: [
              {
                kind: "lookup_ref",
                lookup_id: "categories.merchants",
                input: { kind: "col", name: "a" },
              },
              { kind: "col", name: "a" },
            ],
          },
        },
      ],
    },
  ],
  analytic_tables: [
    {
      id: "t",
      name: "T",
      schema: [
        { name: "category", type: "string" },
        { name: "merchant", type: "string" },
      ],
    },
  ],
};

describe("normalizePipelineConfig", () => {
  it("recognises which configs need upgrading", () => {
    expect(needsUpgrade(LEGACY)).toBe(true);
    expect(needsUpgrade(normalizePipelineConfig(LEGACY))).toBe(false);
  });

  it("converts lookups to dimensions one for one", () => {
    const cfg = normalizePipelineConfig(LEGACY);
    expect((cfg as unknown as Record<string, unknown>).lookup_mappings).toBeUndefined();
    // The child lookup is promoted: dimension ids are flat.
    expect(cfg.dimensions.map((d) => d.id)).toEqual(["categories", "merchants"]);

    const categories = cfg.dimensions[0];
    expect(categories.match).toBe("keyword_substring");
    expect(categories.case_insensitive).toBe(true);
    expect(categories.on_miss).toEqual({ literal: "OTHER" });
    expect(isFileRows(categories.rows)).toBe(false);
    expect(categories.rows.values).toEqual(["value"]);
    expect(isFileRows(categories.rows) ? [] : categories.rows.rows).toEqual([
      { patterns: ["UBER"], values: ["TRANSPORT"] },
      { patterns: ["PAYROLL"], values: ["INCOME"], priority: 10 },
    ]);
  });

  it("rewrites lookup_ref to dim_ref, including a nested one", () => {
    const cfg = normalizePipelineConfig(LEGACY);
    expect(cfg.mappings[0].columns[0].expr).toEqual({
      kind: "dim_ref",
      dim_id: "categories",
      input: { kind: "col", name: "a" },
    });
    // The dotted path resolves to the promoted child's flat id.
    expect(cfg.mappings[0].columns[1].expr).toEqual({
      kind: "coalesce",
      args: [
        { kind: "dim_ref", dim_id: "merchants", input: { kind: "col", name: "a" } },
        { kind: "col", name: "a" },
      ],
    });
  });

  it("supplies the dimensions array a legacy config lacks, and nothing else", () => {
    const cfg = normalizePipelineConfig({ version: 1, name: "Bare" });
    expect(cfg.dimensions).toEqual([]);
    // Anything already current is left untouched, so a read/write round trip
    // does not rewrite unrelated configs.
    expect(Object.keys(cfg).sort()).toEqual(["dimensions", "name", "version"]);
  });

  it("is idempotent", () => {
    const once = normalizePipelineConfig(LEGACY);
    expect(normalizePipelineConfig(once)).toEqual(once);
  });

  it("produces a config the graph can build, with dimension edges intact", () => {
    const cfg = normalizePipelineConfig(LEGACY);
    const { nodes, edges } = buildGraph(cfg);
    expect(nodes.map((n) => n.id).sort()).toEqual(
      ["categories", "m", "merchants", "src", "t"].sort(),
    );
    expect(edges.map((e) => e.id)).toEqual(
      expect.arrayContaining(["categories->m", "merchants->m", "src->m", "m->t"]),
    );
  });

  it("does not throw on a config with no collections at all", () => {
    // The landing page builds a thumbnail per pipeline; one bad config used to
    // fail the whole listing.
    expect(() => buildGraph({ version: 1, name: "x" } as never)).not.toThrow();
  });
});
