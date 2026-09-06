import { describe, expect, it } from "vitest";
import {
  CAST_TYPES,
  EXPRESSION_FUNCTIONS,
  expressionCompletions,
  lintExpression,
} from "../expression-lang";

describe("expressionCompletions", () => {
  it("offers functions and source columns by default", () => {
    const opts = expressionCompletions("upp", ["Date", "Amount"], []);
    const labels = opts.map((o) => o.label);
    expect(labels).toContain("upper");
    expect(labels).toContain("Date");
    expect(opts.find((o) => o.label === "Date")?.type).toBe("variable");
  });

  it("offers lookup ids after lookup_ref(", () => {
    const opts = expressionCompletions("lookup_ref(", ["Date"], ["categories", "merchants"]);
    expect(opts.map((o) => o.label)).toEqual(["categories", "merchants"]);
  });

  it("offers cast types in the second cast argument, quoted when needed", () => {
    const bare = expressionCompletions("cast(Amount, ", ["Amount"], []);
    expect(bare.map((o) => o.label)).toEqual(CAST_TYPES);
    expect(bare[0].apply).toBe('"int64"');
    const quoted = expressionCompletions('cast(Amount, "fl', ["Amount"], []);
    expect(quoted.find((o) => o.label === "float64")?.apply).toBe("float64");
  });

  it("covers every function the parser knows including date parts", () => {
    const labels = EXPRESSION_FUNCTIONS.map((f) => f.label);
    for (const fn of ["year", "month", "day", "parse_date", "lookup_ref"]) {
      expect(labels).toContain(fn);
    }
  });
});

describe("lintExpression", () => {
  it("clean expression yields no diagnostics", () => {
    expect(lintExpression("upper(Description)", ["Description"])).toEqual([]);
  });

  it("parse errors carry the parser position", () => {
    const [d] = lintExpression("upper(", ["Description"]);
    expect(d.severity).toBe("error");
    expect(d.from).toBeGreaterThanOrEqual(0);
  });

  it("unknown columns underline each occurrence", () => {
    const text = 'concat("-", Ghost, Ghost)';
    const ds = lintExpression(text, ["Date"]);
    expect(ds).toHaveLength(2);
    expect(text.slice(ds[0].from, ds[0].to)).toBe("Ghost");
    expect(ds[0].message).toMatch(/not a source column/);
  });

  it("no source connected flags every column ref", () => {
    const ds = lintExpression("trim(Date)", undefined);
    expect(ds).toHaveLength(1);
    expect(ds[0].message).toMatch(/no source container connected/);
  });

  it("empty text is silent", () => {
    expect(lintExpression("   ", ["Date"])).toEqual([]);
  });
});
