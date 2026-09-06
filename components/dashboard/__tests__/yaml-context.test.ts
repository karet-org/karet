import { describe, expect, it } from "vitest";
import {
  completionsAt,
  offsetForPath,
  pathAtOffset,
  queryCompletions,
} from "@/components/dashboard/yaml-context";

const DOC = `version: 2
id: test
name: Test
filters:
  - name: account
    kind: dropdown
    options_sql: SELECT 1
panels:
  - kind: bar
    title: Monthly
    query: |
      SELECT month, total FROM t
    x: month
    y: total
`;

describe("pathAtOffset", () => {
  it("resolves nested paths", () => {
    const inQuery = DOC.indexOf("SELECT month");
    expect(pathAtOffset(DOC, inQuery)).toEqual(["panels", 0, "query"]);
    const inFilterName = DOC.indexOf("account");
    expect(pathAtOffset(DOC, inFilterName)).toEqual(["filters", 0, "name"]);
  });
});

describe("offsetForPath", () => {
  it("finds the key range for a path", () => {
    const r = offsetForPath(DOC, ["panels", 0, "y"]);
    expect(r).not.toBeNull();
    expect(DOC.slice(r![0], r![0] + 1)).toBe("y");
  });

  it("falls back to the container for missing leaves", () => {
    const r = offsetForPath(DOC, ["panels", 0, "nonexistent"]);
    expect(r).not.toBeNull();
  });
});

describe("completionsAt", () => {
  it("offers top-level keys at the root", () => {
    const labels = completionsAt(DOC, [], true, null).map((c) => c.label);
    expect(labels).toContain("panels");
    expect(labels).toContain("filters");
  });

  it("offers kind-specific bindings inside a panel", () => {
    const labels = completionsAt(DOC, ["panels", 0], true, null).map((c) => c.label);
    expect(labels).toContain("x");
    expect(labels).toContain("series");
    expect(labels).not.toContain("source");
  });

  it("offers panel kinds and filter kinds as values", () => {
    expect(completionsAt(DOC, ["panels", 0], false, "kind").map((c) => c.label)).toContain("sankey");
    expect(completionsAt(DOC, ["filters", 0], false, "kind").map((c) => c.label)).toEqual([
      "dropdown",
      "date_range",
    ]);
  });

  it("offers enum values", () => {
    expect(completionsAt(DOC, ["panels", 0], false, "icon").map((c) => c.label)).toContain("dollar");
  });
});

describe("queryCompletions", () => {
  it("includes filter params, tables, and columns", () => {
    const labels = queryCompletions(DOC, { transactions: ["date", "amount"] }).map((c) => c.label);
    expect(labels).toContain("$account");
    expect(labels).toContain("transactions");
    expect(labels).toContain("amount");
  });
});
