import { describe, expect, it } from "vitest";
import { alignHugTargets, linkOpacity, truncate, type Hover } from "../SankeyPanel";

describe("truncate", () => {
  it("leaves short names alone and ellipsizes long ones", () => {
    expect(truncate("Payroll")).toBe("Payroll");
    const long = "PAYROLL DEPOSIT AMAZON DEVELOPMENT CENTRE CCPT";
    const out = truncate(long);
    expect(out.length).toBe(30);
    expect(out.endsWith("\u2026")).toBe(true);
  });
});

describe("linkOpacity", () => {
  const node: Hover = { kind: "node", name: "a", value: 1, x: 0, y: 0 };
  const link: Hover = { kind: "link", from: "a", to: "b", value: 1, x: 0, y: 0 };

  it("is uniform without hover", () => {
    expect(linkOpacity(null, "a", "b")).toBe(0.3);
  });

  it("highlights links touching a hovered node and dims the rest", () => {
    expect(linkOpacity(node, "a", "b")).toBe(0.55);
    expect(linkOpacity(node, "x", "a")).toBe(0.55);
    expect(linkOpacity(node, "x", "y")).toBe(0.08);
  });

  it("highlights only the hovered link", () => {
    expect(linkOpacity(link, "a", "b")).toBe(0.55);
    expect(linkOpacity(link, "a", "c")).toBe(0.08);
  });
});

describe("alignHugTargets", () => {
  const N = 3;
  it("keeps ordinary sources at their depth and sinks at the right edge", () => {
    expect(alignHugTargets({ depth: 0, sourceLinks: [{ target: { depth: 1 } }], targetLinks: [] }, N)).toBe(0);
    expect(alignHugTargets({ depth: 1, sourceLinks: [], targetLinks: [{}] }, N)).toBe(2);
  });

  it("pulls an inflow-less node next to its targets", () => {
    // Spend-only account: no inflows, outflows to depth-2 categories.
    expect(alignHugTargets({ depth: 0, sourceLinks: [{ target: { depth: 2 } }], targetLinks: [] }, N)).toBe(1);
  });

  it("leaves mid-chain nodes at their computed depth", () => {
    expect(alignHugTargets({ depth: 1, sourceLinks: [{ target: { depth: 2 } }], targetLinks: [{}] }, N)).toBe(1);
  });
});
