import { describe, expect, it } from "vitest";
import { aggregateSankey } from "../aggregateSankey";
import type { SankeyFlow } from "@/lib/types/dashboard";

describe("aggregateSankey", () => {
  const rows = [
    { src: "a", dst: "x", v: 10, kind: "in" },
    { src: "a", dst: "x", v: 5, kind: "in" },
    { src: "a", dst: "y", v: 7, kind: "in" },
    { src: "b", dst: "x", v: 3, kind: "in" },
    { src: "b", dst: "y", v: -2, kind: "out" },
  ];

  it("sums per (from, to) pair", () => {
    const flow: SankeyFlow = { from: "src", to: "dst", value: "v" };
    const { links } = aggregateSankey(rows, [flow]);
    expect(links).toEqual(
      expect.arrayContaining([
        { from: "a", to: "x", flow: 15 },
        { from: "a", to: "y", flow: 7 },
        { from: "b", to: "x", flow: 3 },
      ]),
    );
    expect(links.find((l) => l.from === "b" && l.to === "y")).toBeUndefined();
  });

  it("agg: 'abs_sum' sums absolute values so signed inflows still render", () => {
    const flow: SankeyFlow = { from: "src", to: "dst", value: "v", agg: "abs_sum" };
    const { links } = aggregateSankey(rows, [flow]);
    expect(links.find((l) => l.from === "b" && l.to === "y")?.flow).toBe(2);
  });

  it("agg: 'count' counts rows per pair", () => {
    const flow: SankeyFlow = { from: "src", to: "dst", value: "v", agg: "count" };
    const { links } = aggregateSankey(rows, [flow]);
    expect(links.find((l) => l.from === "a" && l.to === "x")?.flow).toBe(2);
    expect(links.find((l) => l.from === "a" && l.to === "y")?.flow).toBe(1);
  });

  it("applies per-flow where", () => {
    const flow: SankeyFlow = {
      from: "src",
      to: "dst",
      value: "v",
      where: [
        { kind: "eq", left: { kind: "col", name: "kind" }, right: { kind: "str", value: "in" } },
      ],
    };
    const { links } = aggregateSankey(rows, [flow]);
    expect(links.every((l) => !(l.from === "b" && l.to === "y"))).toBe(true);
  });

  it("composes multiple flows into one link list", () => {
    const flow1: SankeyFlow = {
      from: "src",
      to: "dst",
      value: "v",
      where: [
        { kind: "eq", left: { kind: "col", name: "kind" }, right: { kind: "str", value: "in" } },
      ],
    };
    const flow2: SankeyFlow = { from: "dst", to: "kind", value: "v", agg: "count" };
    const { links } = aggregateSankey(rows, [flow1, flow2]);
    expect(links.some((l) => l.from === "a" && l.to === "x")).toBe(true);
    expect(links.some((l) => l.from === "x" && l.to === "in")).toBe(true);
  });

  it("returns empty link list for empty rows or empty flows", () => {
    expect(aggregateSankey([], [{ from: "a", to: "b", value: "c" }]).links).toEqual([]);
    expect(aggregateSankey(rows, []).links).toEqual([]);
  });

  describe("columns map", () => {
    it("places flow[i].from at column i and flow[i].to at column i+1", () => {
      const flow: SankeyFlow = { from: "src", to: "dst", value: "v" };
      const { columns } = aggregateSankey(rows, [flow]);
      expect(columns.a).toBe(0);
      expect(columns.b).toBe(0);
      expect(columns.x).toBe(1);
      expect(columns.y).toBe(1);
    });

    it("a node appearing in two flows takes the larger column assignment", () => {
      const flows: SankeyFlow[] = [
        { from: "src", to: "dst", value: "v" },
        { from: "dst", to: "kind", value: "v", agg: "count" },
      ];
      const { columns } = aggregateSankey(rows, flows);
      expect(columns.x).toBe(1);
      expect(columns.in).toBe(2);
    });

    it("pins from-only nodes to their flow's source column", () => {
      const { columns } = aggregateSankey(rows, [{ from: "src", to: "dst", value: "v" }]);
      expect(columns.b).toBe(0);
      expect(columns.phantom).toBeUndefined();
    });

    it("shifts columns down so the smallest used hint is 0", () => {
      // First flow filters everything out; without the shift, hints
      // would span {1, 2} and break d3-sankey's nodeAlign contract.
      const flows: SankeyFlow[] = [
        { from: "kind", to: "src", value: "v",
          where: [
            { kind: "eq", left: { kind: "col", name: "kind" }, right: { kind: "str", value: "MISSING" } },
          ] },
        { from: "src", to: "dst", value: "v" },
      ];
      const { columns } = aggregateSankey(rows, flows);
      const values = Object.values(columns);
      expect(Math.min(...values)).toBe(0);
      expect(new Set(values)).toEqual(new Set([0, 1]));
    });
  });

  describe("nodeColumns map", () => {
    it("tags each node with the source column it came from", () => {
      const flow: SankeyFlow = { from: "src", to: "dst", value: "v" };
      const { nodeColumns } = aggregateSankey(rows, [flow]);
      expect(nodeColumns.a).toBe("src");
      expect(nodeColumns.b).toBe("src");
      expect(nodeColumns.x).toBe("dst");
      expect(nodeColumns.y).toBe("dst");
    });

    it("uses the first encountered column for nodes appearing in two flows", () => {
      const flows: SankeyFlow[] = [
        { from: "src", to: "dst", value: "v" },
        { from: "dst", to: "kind", value: "v", agg: "count" },
      ];
      const { nodeColumns } = aggregateSankey(rows, flows);
      expect(nodeColumns.x).toBe("dst");
      expect(nodeColumns.in).toBe("kind");
    });
  });
});
