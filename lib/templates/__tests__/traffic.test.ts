// The Traffic template is the worked example for every node type, so it has
// to keep passing the same checks the app applies at save time, and its seed
// files have to keep matching the prefixes its sources and dimensions read.

import { describe, expect, it } from "vitest";
import { TEMPLATES } from "@/lib/templates";
import { trafficPipeline } from "@/lib/templates/traffic";
import { isFileRows } from "@/lib/types/config";
import { buildGraph } from "@/lib/graph/build";
import { validateDimension, validateRollup } from "@/components/graph/detail/validation";

const template = TEMPLATES.traffic;

describe("traffic template", () => {
  it("exercises every node type and source format", () => {
    expect(trafficPipeline.source_containers.map((s) => s.format ?? "csv")).toEqual([
      "ndjson",
      "csv",
    ]);
    expect(trafficPipeline.dimensions).toHaveLength(3);
    expect(trafficPipeline.rollups).toHaveLength(2);
    // Union: two mappings into one table.
    const targets = trafficPipeline.mappings.map((m) => m.analytic_table_id);
    expect(new Set(targets).size).toBe(1);
    expect(targets).toHaveLength(2);
    // A row filter, hive partitioning and dedup keys are all in play.
    expect(trafficPipeline.mappings[0].where).toBeDefined();
    const requests = trafficPipeline.analytic_tables[0];
    expect(requests.partition_keys).toEqual(["month"]);
    expect(requests.dedup_keys?.length).toBeGreaterThan(0);
  });

  it("covers all three dimension shapes", () => {
    const [services, crawlers, countries] = trafficPipeline.dimensions;
    expect(services.on_miss).toBe("passthrough");
    expect(isFileRows(services.rows)).toBe(false);
    // Multi-value: two columns from one match.
    expect(services.rows.values).toHaveLength(2);
    expect(crawlers.match).toBe("keyword_substring");
    expect(crawlers.on_miss).toBe("null");
    expect(countries.match).toBe("exact");
    expect(countries.on_miss).toEqual({ literal: "Unknown" });
    expect(isFileRows(countries.rows)).toBe(true);
  });

  it("covers every aggregate function across its rollups", () => {
    const fns = new Set(
      (trafficPipeline.rollups ?? []).flatMap((r) => r.aggregates.map((a) => a.fn)),
    );
    expect([...fns].sort()).toEqual(["avg", "count", "count_distinct", "median", "sum"]);
    // At least one conditional aggregate.
    const conditional = (trafficPipeline.rollups ?? [])
      .flatMap((r) => r.aggregates)
      .filter((a) => a.where);
    expect(conditional.length).toBeGreaterThanOrEqual(2);
  });

  it("passes the per-entity validators the inspector uses", () => {
    for (const dimension of trafficPipeline.dimensions) {
      expect(validateDimension(dimension).errors).toEqual([]);
    }
    for (const rollup of trafficPipeline.rollups ?? []) {
      const source = trafficPipeline.analytic_tables.find((t) => t.id === rollup.source_table_id);
      const target = trafficPipeline.analytic_tables.find(
        (t) => t.id === rollup.analytic_table_id,
      );
      expect(validateRollup(rollup, source, target).errors).toEqual([]);
    }
  });

  it("references only declared columns from every mapping", () => {
    for (const mapping of trafficPipeline.mappings) {
      const source = trafficPipeline.source_containers.find(
        (s) => s.id === mapping.source_container_id,
      );
      const sourceCols = new Set(source?.schema.map((c) => c.name));
      const table = trafficPipeline.analytic_tables.find(
        (t) => t.id === mapping.analytic_table_id,
      );
      const tableCols = new Set(table?.schema.map((c) => c.name));
      const dimIds = new Set(trafficPipeline.dimensions.map((d) => d.id));

      for (const column of mapping.columns) {
        expect(tableCols.has(column.name)).toBe(true);
        const stack = [column.expr];
        while (stack.length) {
          const node = stack.pop()!;
          if (node.kind === "col") expect(sourceCols.has(node.name)).toBe(true);
          if (node.kind === "dim_ref") {
            expect(dimIds.has(node.dim_id)).toBe(true);
            if (node.value) {
              const dimension = trafficPipeline.dimensions.find((d) => d.id === node.dim_id)!;
              expect(dimension.rows.values).toContain(node.value);
            }
          }
          for (const value of Object.values(node as Record<string, unknown>)) {
            if (value && typeof value === "object") {
              stack.push(...(Array.isArray(value) ? value : [value]));
            }
          }
        }
      }
    }
  });

  it("declares every column its record_filter references", () => {
    for (const source of trafficPipeline.source_containers) {
      if (!source.record_filter) continue;
      const declared = new Set(source.schema.map((c) => c.name));
      const stack = [source.record_filter];
      while (stack.length) {
        const node = stack.pop()!;
        // The filter runs after path extraction, so it can only see declared
        // columns.
        if (node.kind === "col") expect(declared.has(node.name)).toBe(true);
        for (const value of Object.values(node as Record<string, unknown>)) {
          if (value && typeof value === "object") {
            stack.push(...(Array.isArray(value) ? value : [value]));
          }
        }
      }
    }
  });

  it("seeds a file for every prefix it reads", () => {
    const seeds = Object.keys(template.rawFiles ?? {});
    const prefixes = [
      ...trafficPipeline.source_containers.map((s) => s.path_prefix),
      ...trafficPipeline.dimensions
        .map((d) => d.rows)
        .filter(isFileRows)
        .map((r) => r.path_prefix),
    ];
    for (const prefix of prefixes) {
      expect(seeds.some((k) => k.startsWith(prefix))).toBe(true);
    }
    // Seeds must land in the lake, which the bucket router decides by
    // extension.
    for (const seed of seeds.filter((k) => !k.startsWith("dashboards/"))) {
      expect(seed).toMatch(/\.(csv|ndjson|jsonl)$/);
    }
  });

  it("seeds NDJSON whose records match the declared paths", () => {
    const ndjson = template.rawFiles!["caddy_access/access.ndjson"];
    const records = ndjson
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    // One line is not a request, so the record_filter has something to drop.
    const handled = records.filter((r) => r.msg === "handled request");
    expect(handled.length).toBeLessThan(records.length);

    const resolve = (record: Record<string, unknown>, path: string): unknown =>
      path.split(".").reduce<unknown>((node, part) => {
        const match = /^(.*)\[(\d+)\]$/.exec(part);
        const key = match ? match[1] : part;
        const value = (node as Record<string, unknown> | undefined)?.[key];
        return match && Array.isArray(value) ? value[Number(match[2])] : value;
      }, record);

    const schema = trafficPipeline.source_containers[0].schema;
    for (const column of schema) {
      const path = column.path ?? column.name;
      const resolved = handled.map((r) => resolve(r, path)).filter((v) => v !== undefined);
      expect(resolved.length, `${path} resolves in the seed`).toBeGreaterThan(0);
    }
  });

  it("builds a graph with an edge for every reference", () => {
    const { nodes, edges } = buildGraph(trafficPipeline);
    // 2 sources + 3 dimensions + 2 mappings + 3 tables + 2 rollups.
    expect(nodes).toHaveLength(12);
    expect(edges.map((e) => e.id)).toEqual(
      expect.arrayContaining([
        "caddy_access_raw->caddy_mapping",
        "edge_access_raw->edge_mapping",
        "countries->caddy_mapping",
        "crawlers->edge_mapping",
        "caddy_mapping->requests",
        "requests->daily_traffic",
        "daily_traffic->requests_daily",
        "requests->region_traffic",
        "region_traffic->requests_by_region",
      ]),
    );
  });
});
