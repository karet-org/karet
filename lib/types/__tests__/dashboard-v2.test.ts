import { describe, expect, it } from "vitest";
import {
  extractParams,
  filterParams,
  validateDashboardV2,
} from "@/lib/types/dashboard-v2";

const VALID = `
version: 2
id: spending
name: Spending
filters:
  - name: account
    kind: dropdown
    options_sql: SELECT DISTINCT account FROM transactions
  - name: period
    kind: date_range
panels:
  - kind: bar
    title: Monthly
    query: |
      SELECT month, total FROM t
      WHERE account = coalesce($account, account)
        AND d >= coalesce($period_from, d)
    x: month
    y: total
  - kind: table
    title: Recent
    query_id: recent
`;

describe("validateDashboardV2", () => {
  it("accepts a valid config", () => {
    const r = validateDashboardV2(VALID);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.panelCount).toBe(2);
      expect(r.config.filters).toHaveLength(2);
    }
  });

  it("rejects invalid YAML and non-mappings", () => {
    expect(validateDashboardV2("{{{").ok).toBe(false);
    expect(validateDashboardV2("- a\n- b").ok).toBe(false);
  });

  it("requires version 2, slug id, name, panels", () => {
    const r = validateDashboardV2("version: 1\nid: Bad Id\nname: ''\npanels: []");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const all = r.errors.join("\n");
      expect(all).toMatch(/version/);
      expect(all).toMatch(/id/);
      expect(all).toMatch(/name/);
      expect(all).toMatch(/panels/);
    }
  });

  it("enforces per-kind bindings and query xor query_id", () => {
    const r = validateDashboardV2(`
version: 2
id: x
name: X
panels:
  - kind: sankey
    title: Flow
    query: SELECT 1
  - kind: bar
    title: Both
    query: SELECT 1
    query_id: also
    x: a
    y: b
`);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const all = r.errors.join("\n");
      expect(all).toMatch(/"source" binding/);
      expect(all).toMatch(/"target" binding/);
      expect(all).toMatch(/exactly one of query or query_id/);
    }
  });

  it("rejects undeclared $params, allows declared ones", () => {
    const r = validateDashboardV2(`
version: 2
id: x
name: X
panels:
  - kind: kpi
    title: T
    query: SELECT sum(a) AS v FROM t WHERE b = $mystery
    value: v
`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/\$mystery/);
  });

  it("dropdown filters require options_sql; duplicate params rejected", () => {
    const r = validateDashboardV2(`
version: 2
id: x
name: X
filters:
  - name: a
    kind: dropdown
  - name: a
    kind: dropdown
    options_sql: SELECT 1
panels:
  - kind: summary
    title: S
    query: SELECT 1
`);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join()).toMatch(/options_sql/);
      expect(r.errors.join()).toMatch(/declared twice/);
    }
  });
});

describe("extractParams", () => {
  it("finds params outside strings and comments", () => {
    expect(
      extractParams(
        "SELECT '$not_me' AS a, $yes -- $comment\n /* $block */ FROM t WHERE b = $yes AND c = $two",
      ).sort(),
    ).toEqual(["two", "yes"]);
  });

  it("handles escaped quotes in literals", () => {
    expect(extractParams("SELECT 'it''s $hidden' , $shown")).toEqual(["shown"]);
  });
});

describe("filterParams", () => {
  it("expands date_range into _from/_to", () => {
    expect(filterParams({ name: "p", kind: "date_range" })).toEqual(["p_from", "p_to"]);
    expect(filterParams({ name: "a", kind: "dropdown" })).toEqual(["a"]);
  });
});
