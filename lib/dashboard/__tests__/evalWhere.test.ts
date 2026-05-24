// Tests for the dashboard `where` evaluator: boolean subset of AstNode,
// asymmetric null handling, string coercions, rejection of unsupported
// kinds, AND-of-predicates semantics, and a property test asserting the
// filter is a subset, order-preserving, and idempotent.

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { AstNode } from "@/lib/types/config";
import type { Row } from "@/components/dashboard/types";
import {
  applyWhere,
  evalNode,
  UnsupportedWhereNodeError,
} from "../evalWhere";

// AST builder helpers.
const col = (name: string): AstNode => ({ kind: "col", name });
const str = (value: string): AstNode => ({ kind: "str", value });
const num = (value: number): AstNode => ({ kind: "num", value });
const bool = (value: boolean): AstNode => ({ kind: "bool", value });
const nul: AstNode = { kind: "null" };

const eq = (left: AstNode, right: AstNode): AstNode => ({ kind: "eq", left, right });
const ne = (left: AstNode, right: AstNode): AstNode => ({ kind: "ne", left, right });
const gt = (left: AstNode, right: AstNode): AstNode => ({ kind: "gt", left, right });
const lt = (left: AstNode, right: AstNode): AstNode => ({ kind: "lt", left, right });
const ge = (left: AstNode, right: AstNode): AstNode => ({ kind: "ge", left, right });
const le = (left: AstNode, right: AstNode): AstNode => ({ kind: "le", left, right });
const contains = (input: AstNode, pattern: AstNode): AstNode => ({
  kind: "contains",
  input,
  pattern,
});
const upper = (input: AstNode): AstNode => ({ kind: "upper", input });
const lower = (input: AstNode): AstNode => ({ kind: "lower", input });
const trim = (input: AstNode): AstNode => ({ kind: "trim", input });

describe("evalNode — literals and column refs", () => {
  const row: Row = { name: "ALICE", age: 30, active: true, missing: null };

  it("col returns the row value when present", () => {
    expect(evalNode(col("name"), row)).toBe("ALICE");
    expect(evalNode(col("age"), row)).toBe(30);
    expect(evalNode(col("active"), row)).toBe(true);
  });

  it("col returns null for missing or null fields", () => {
    expect(evalNode(col("missing"), row)).toBe(null);
    expect(evalNode(col("not_a_field"), row)).toBe(null);
  });

  it("col coerces unknown shapes (objects, arrays) to null", () => {
    const weird: Row = { x: { nested: 1 }, y: [1, 2, 3] };
    expect(evalNode(col("x"), weird)).toBe(null);
    expect(evalNode(col("y"), weird)).toBe(null);
  });

  it("col preserves Date values", () => {
    const d = new Date("2025-01-15T00:00:00Z");
    expect(evalNode(col("d"), { d })).toBe(d);
  });

  it("col returns null for invalid Date instances", () => {
    expect(evalNode(col("d"), { d: new Date("not-a-date") })).toBe(null);
  });

  it("literals evaluate to themselves", () => {
    expect(evalNode(str("hi"), {})).toBe("hi");
    expect(evalNode(num(42), {})).toBe(42);
    expect(evalNode(bool(false), {})).toBe(false);
    expect(evalNode(nul, {})).toBe(null);
  });
});

describe("evalNode — eq", () => {
  it("matches equal strings", () => {
    expect(evalNode(eq(col("c"), str("FOOD")), { c: "FOOD" })).toBe(true);
  });

  it("rejects unequal strings", () => {
    expect(evalNode(eq(col("c"), str("FOOD")), { c: "SHOPPING" })).toBe(false);
  });

  it("matches equal numbers", () => {
    expect(evalNode(eq(col("n"), num(5)), { n: 5 })).toBe(true);
    expect(evalNode(eq(col("n"), num(5)), { n: 6 })).toBe(false);
  });

  it("returns false when either side is null (SQL-like)", () => {
    expect(evalNode(eq(col("c"), str("FOOD")), { c: null })).toBe(false);
    expect(evalNode(eq(col("c"), nul), { c: "FOOD" })).toBe(false);
    expect(evalNode(eq(nul, nul), {})).toBe(false);
  });

  it("compares Dates via timestamp equality", () => {
    const a = new Date("2025-01-15T00:00:00Z");
    const b = new Date("2025-01-15T00:00:00Z");
    expect(evalNode(eq(col("d"), col("e")), { d: a, e: b })).toBe(true);
    const c = new Date("2025-01-16T00:00:00Z");
    expect(evalNode(eq(col("d"), col("e")), { d: a, e: c })).toBe(false);
  });
});

describe("evalNode — ne", () => {
  it("returns true for unequal strings", () => {
    expect(evalNode(ne(col("c"), str("FOOD")), { c: "SHOPPING" })).toBe(true);
  });

  it("returns false for equal strings", () => {
    expect(evalNode(ne(col("c"), str("FOOD")), { c: "FOOD" })).toBe(false);
  });

  it("returns true when either side is null (degrade-gracefully)", () => {
    // Deliberate departure from SQL: keeps rows whose column hasn't
    // been categorized yet rather than silently dropping them.
    expect(evalNode(ne(col("c"), str("TRANSFER")), { c: null })).toBe(true);
    expect(evalNode(ne(col("c"), str("TRANSFER")), {})).toBe(true);
    expect(evalNode(ne(col("c"), nul), { c: "FOOD" })).toBe(true);
  });
});

describe("evalNode — gt / lt / ge / le", () => {
  it("compares numbers", () => {
    expect(evalNode(gt(col("n"), num(5)), { n: 6 })).toBe(true);
    expect(evalNode(gt(col("n"), num(5)), { n: 5 })).toBe(false);
    expect(evalNode(ge(col("n"), num(5)), { n: 5 })).toBe(true);
    expect(evalNode(lt(col("n"), num(5)), { n: 4 })).toBe(true);
    expect(evalNode(le(col("n"), num(5)), { n: 5 })).toBe(true);
  });

  it("compares strings lexicographically", () => {
    expect(evalNode(lt(col("s"), str("M")), { s: "A" })).toBe(true);
    expect(evalNode(gt(col("s"), str("M")), { s: "Z" })).toBe(true);
  });

  it("compares Dates by timestamp", () => {
    const earlier = new Date("2024-01-01T00:00:00Z");
    const later = new Date("2025-01-01T00:00:00Z");
    expect(evalNode(lt(col("d"), col("e")), { d: earlier, e: later })).toBe(true);
    expect(evalNode(gt(col("d"), col("e")), { d: earlier, e: later })).toBe(false);
  });

  it("returns false when either side is null", () => {
    expect(evalNode(gt(col("n"), num(0)), { n: null })).toBe(false);
    expect(evalNode(le(col("n"), num(0)), { n: null })).toBe(false);
  });
});

describe("evalNode — contains", () => {
  it("performs literal substring match", () => {
    expect(evalNode(contains(col("d"), str("STAR")), { d: "STARBUCKS" })).toBe(true);
    expect(evalNode(contains(col("d"), str("BURGER")), { d: "STARBUCKS" })).toBe(false);
  });

  it("returns false on null haystack or needle", () => {
    expect(evalNode(contains(col("d"), str("X")), { d: null })).toBe(false);
    expect(evalNode(contains(col("d"), nul), { d: "STARBUCKS" })).toBe(false);
  });

  it("is case-sensitive (callers should lower() if needed)", () => {
    expect(evalNode(contains(col("d"), str("star")), { d: "STARBUCKS" })).toBe(false);
    expect(
      evalNode(contains(lower(col("d")), str("star")), { d: "STARBUCKS" }),
    ).toBe(true);
  });
});

describe("evalNode — upper / lower / trim", () => {
  it("upper uppercases the input", () => {
    expect(evalNode(upper(col("s")), { s: "Hello" })).toBe("HELLO");
  });
  it("lower lowercases the input", () => {
    expect(evalNode(lower(col("s")), { s: "Hello" })).toBe("hello");
  });
  it("trim strips whitespace", () => {
    expect(evalNode(trim(col("s")), { s: "  hi  " })).toBe("hi");
  });
  it("propagates null", () => {
    expect(evalNode(upper(col("s")), { s: null })).toBe(null);
    expect(evalNode(lower(col("s")), { s: null })).toBe(null);
    expect(evalNode(trim(col("s")), { s: null })).toBe(null);
  });
});

describe("evalNode — unsupported kinds throw", () => {
  it("rejects arithmetic", () => {
    const expr: AstNode = { kind: "add", left: num(1), right: num(2) };
    expect(() => evalNode(expr, {})).toThrow(UnsupportedWhereNodeError);
  });

  it("rejects parse_date", () => {
    const expr: AstNode = { kind: "parse_date", input: col("s"), format: "%Y-%m-%d" };
    expect(() => evalNode(expr, {})).toThrow(UnsupportedWhereNodeError);
  });

  it("rejects lookup_ref", () => {
    const expr: AstNode = { kind: "lookup_ref", lookup_id: "x", input: col("s") };
    expect(() => evalNode(expr, {})).toThrow(UnsupportedWhereNodeError);
  });

  it("rejects cast", () => {
    const expr: AstNode = { kind: "cast", input: col("s"), to: "int64" };
    expect(() => evalNode(expr, {})).toThrow(UnsupportedWhereNodeError);
  });

  it("rejects if/then/else", () => {
    const expr: AstNode = {
      kind: "if",
      cond: bool(true),
      then: bool(true),
      else: bool(false),
    };
    expect(() => evalNode(expr, {})).toThrow(UnsupportedWhereNodeError);
  });
});

describe("applyWhere", () => {
  const rows: Row[] = [
    { id: 1, category: "FOOD" },
    { id: 2, category: "TRANSFER" },
    { id: 3, category: "INVESTMENT" },
    { id: 4, category: "SHOPPING" },
    { id: 5, category: null }, // pre-recategorization
  ];

  it("returns rows unchanged when where is missing or empty", () => {
    expect(applyWhere(rows, undefined)).toBe(rows);
    expect(applyWhere(rows, [])).toBe(rows);
  });

  it("filters by a single predicate", () => {
    const out = applyWhere(rows, [eq(col("category"), str("FOOD"))]);
    expect(out.map((r) => r.id)).toEqual([1]);
  });

  it("ANDs multiple predicates", () => {
    const out = applyWhere(rows, [
      ne(col("category"), str("TRANSFER")),
      ne(col("category"), str("INVESTMENT")),
    ]);
    // Includes the null-category row by design (degrade-gracefully).
    expect(out.map((r) => r.id)).toEqual([1, 4, 5]);
  });

  it("preserves input order", () => {
    const reversed: Row[] = [
      { id: 4, category: "SHOPPING" },
      { id: 1, category: "FOOD" },
    ];
    const out = applyWhere(reversed, [ne(col("category"), str("X"))]);
    expect(out.map((r) => r.id)).toEqual([4, 1]);
  });

  it("a where with non-boolean top-level uses JS-truthy semantics", () => {
    // A bare column reference: rows where `flag` is truthy are kept.
    const data: Row[] = [
      { id: 1, flag: "yes" },
      { id: 2, flag: "" },
      { id: 3, flag: null },
      { id: 4, flag: 0 },
      { id: 5, flag: 1 },
    ];
    const out = applyWhere(data, [col("flag")]);
    expect(out.map((r) => r.id)).toEqual([1, 5]);
  });

  // -----------------------------------------------------------------
  // Property: filter is a subset, order-preserving, and idempotent.
  // -----------------------------------------------------------------
  it("is a subset, order-preserving, and idempotent (property)", () => {
    const arbCategory = fc.constantFrom(
      "FOOD",
      "TRANSFER",
      "INVESTMENT",
      "SHOPPING",
      null,
    );
    const arbRows = fc.array(
      fc.record({
        id: fc.integer(),
        category: arbCategory,
      }),
      { maxLength: 50 },
    );
    const arbWhere = fc.array(
      fc.constantFrom<AstNode>(
        ne(col("category"), str("TRANSFER")),
        ne(col("category"), str("INVESTMENT")),
        eq(col("category"), str("FOOD")),
      ),
      { maxLength: 3 },
    );

    fc.assert(
      fc.property(arbRows, arbWhere, (rs, where) => {
        const out = applyWhere(rs, where);

        // Subset: every output row appears in the input.
        for (const r of out) expect(rs).toContainEqual(r);

        // Order-preserving: the indices of output rows in the input
        // are strictly increasing.
        let lastIdx = -1;
        for (const r of out) {
          const idx = rs.findIndex((x) => x === r);
          expect(idx).toBeGreaterThan(lastIdx);
          lastIdx = idx;
        }

        // Idempotent: applying the same where twice == once.
        const out2 = applyWhere(out, where);
        expect(out2).toEqual(out);
      }),
      { numRuns: 200 },
    );
  });
});
