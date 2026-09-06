import { describe, expect, it } from "vitest";
import {
  bindNulls,
  bindParams,
  coerceParams,
  panelBindings,
} from "@/lib/services/dashboard-data";
import type { PanelV2 } from "@/lib/types/dashboard-v2";

describe("bindParams", () => {
  it("rewrites $names to placeholders in order, collecting values", () => {
    const r = bindParams("SELECT * FROM t WHERE a = $x AND b = $y AND c = $x", {
      x: "1",
      y: null,
    });
    expect(r).toEqual({
      sql: "SELECT * FROM t WHERE a = ? AND b = ? AND c = ?",
      values: ["1", null, "1"],
    });
  });

  it("leaves $ inside string literals alone", () => {
    const r = bindParams("SELECT '$x' AS lit WHERE a = $x", { x: "v" });
    expect(r).toEqual({ sql: "SELECT '$x' AS lit WHERE a = ?", values: ["v"] });
  });

  it("errors on missing parameters", () => {
    expect(bindParams("SELECT $nope", {})).toEqual({
      error: "Missing parameter $nope",
    });
  });
});

describe("bindNulls", () => {
  it("substitutes NULL outside literals only", () => {
    expect(bindNulls("SELECT '$a', $a, $b_2")).toBe("SELECT '$a', NULL, NULL");
  });
});

describe("coerceParams", () => {
  it("types filter and emit params, null for empty/missing, drops unknown", () => {
    expect(
      coerceParams(
        {
          filters: [
            { name: "account", kind: "dropdown", options_sql: "SELECT 1" },
            { name: "period", kind: "date_range" },
          ],
          panels: [
            { kind: "doughnut", title: "t", query: "q", label: "a", value: "b", emit: { param: "category" } },
          ],
        },
        { account: "chequing", period_from: "", category: "BILLS", junk: "x" },
      ),
    ).toEqual({ account: "chequing", period_from: null, period_to: null, category: "BILLS" });
  });

  it("ignores non-object input", () => {
    expect(
      coerceParams(
        { filters: [{ name: "a", kind: "dropdown", options_sql: "s" }], panels: [] },
        "x",
      ),
    ).toEqual({ a: null });
  });
});

describe("panelBindings", () => {
  it("collects the kind-specific bound columns", () => {
    const bar: PanelV2 = { kind: "bar", title: "t", query: "q", x: "m", y: "v", series: "s" };
    expect(panelBindings(bar)).toEqual(["m", "v", "s"]);
    const sankey: PanelV2 = { kind: "sankey", title: "t", query: "q", source: "a", target: "b", value: "c" };
    expect(panelBindings(sankey)).toEqual(["a", "b", "c"]);
    const table: PanelV2 = { kind: "table", title: "t", query: "q" };
    expect(panelBindings(table)).toEqual([]);
  });
});
