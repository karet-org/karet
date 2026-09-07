import { describe, expect, it } from "vitest";
import { linkOpacity, truncate, type Hover } from "../SankeyPanel";

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
