import { describe, expect, it } from "vitest";
import type { AstNode } from "@/lib/types/config";
import {
  evalValue,
  resolveValue,
  valueFieldColumns,
  UnsupportedValueNodeError,
} from "../evalValue";

const col = (name: string): AstNode => ({ kind: "col", name });
const num = (value: number): AstNode => ({ kind: "num", value });

describe("evalValue", () => {
  it("reads a numeric column", () => {
    expect(evalValue(col("amount"), { amount: 42 })).toBe(42);
  });

  it("coerces numeric strings", () => {
    expect(evalValue(col("amount"), { amount: "12.5" })).toBe(12.5);
  });

  it("returns null for non-numeric or missing columns", () => {
    expect(evalValue(col("amount"), { amount: "x" })).toBe(null);
    expect(evalValue(col("amount"), {})).toBe(null);
  });

  it("negates via mul by -1", () => {
    const expr: AstNode = { kind: "mul", left: col("amount"), right: num(-1) };
    expect(evalValue(expr, { amount: 100 })).toBe(-100);
  });

  it("subtracts two columns", () => {
    const expr: AstNode = { kind: "sub", left: col("inflow"), right: col("outflow") };
    expect(evalValue(expr, { inflow: 300, outflow: 50 })).toBe(250);
  });

  it("supports add, mul, and div", () => {
    expect(evalValue({ kind: "add", left: num(2), right: num(3) }, {})).toBe(5);
    expect(evalValue({ kind: "mul", left: num(4), right: num(3) }, {})).toBe(12);
    expect(evalValue({ kind: "div", left: num(9), right: num(3) }, {})).toBe(3);
  });

  it("returns null on divide by zero", () => {
    expect(evalValue({ kind: "div", left: num(1), right: num(0) }, {})).toBe(null);
  });

  it("propagates null through arithmetic", () => {
    const expr: AstNode = { kind: "sub", left: col("a"), right: col("b") };
    expect(evalValue(expr, { a: 5 })).toBe(null);
  });

  it("throws on unsupported kinds", () => {
    expect(() => evalValue({ kind: "upper", input: col("a") }, {})).toThrow(
      UnsupportedValueNodeError,
    );
  });
});

describe("evalValue: if + comparisons", () => {
  const str = (value: string): AstNode => ({ kind: "str", value });
  const eqNode = (left: AstNode, right: AstNode): AstNode => ({ kind: "eq", left, right });
  const ifNode = (cond: AstNode, then: AstNode, els: AstNode): AstNode => ({
    kind: "if",
    cond,
    then,
    else: els,
  });

  it("computes inflow = if(amount < 0, -amount, 0)", () => {
    const inflow = ifNode(
      { kind: "lt", left: col("amount"), right: num(0) },
      { kind: "mul", left: col("amount"), right: num(-1) },
      num(0),
    );
    expect(evalValue(inflow, { amount: -3000 })).toBe(3000); // income row
    expect(evalValue(inflow, { amount: 42 })).toBe(0); // spending row
  });

  it("computes outflow = if(amount > 0, amount, 0)", () => {
    const outflow = ifNode(
      { kind: "gt", left: col("amount"), right: num(0) },
      col("amount"),
      num(0),
    );
    expect(evalValue(outflow, { amount: 42 })).toBe(42);
    expect(evalValue(outflow, { amount: -3000 })).toBe(0);
  });

  it("supports string equality in conditions", () => {
    const expr = ifNode(eqNode(col("category"), str("INCOME")), num(1), num(0));
    expect(evalValue(expr, { category: "INCOME" })).toBe(1);
    expect(evalValue(expr, { category: "FOOD" })).toBe(0);
  });

  it("treats a null condition operand as false", () => {
    const expr = ifNode(
      { kind: "lt", left: col("amount"), right: num(0) },
      num(1),
      num(0),
    );
    expect(evalValue(expr, {})).toBe(0);
  });

  it("supports ge/le/ne", () => {
    expect(evalValue(ifNode({ kind: "ge", left: col("n"), right: num(5) }, num(1), num(0)), { n: 5 })).toBe(1);
    expect(evalValue(ifNode({ kind: "le", left: col("n"), right: num(5) }, num(1), num(0)), { n: 6 })).toBe(0);
    expect(evalValue(ifNode({ kind: "ne", left: col("c"), right: str("X") }, num(1), num(0)), { c: "Y" })).toBe(1);
  });
});

describe("resolveValue", () => {
  it("treats a string field as a column name", () => {
    expect(resolveValue({ net: 7 }, "net")).toBe(7);
  });

  it("evaluates an expression field", () => {
    const expr: AstNode = { kind: "mul", left: col("amount"), right: num(-1) };
    expect(resolveValue({ amount: 30 }, expr)).toBe(-30);
  });
});

describe("valueFieldColumns", () => {
  it("returns the column for a string field", () => {
    expect(valueFieldColumns("amount")).toEqual(["amount"]);
  });

  it("walks an expression for column refs", () => {
    const expr: AstNode = { kind: "sub", left: col("inflow"), right: col("outflow") };
    expect(valueFieldColumns(expr)).toEqual(["inflow", "outflow"]);
  });

  it("ignores numeric literals", () => {
    const expr: AstNode = { kind: "mul", left: col("amount"), right: num(-1) };
    expect(valueFieldColumns(expr)).toEqual(["amount"]);
  });
});
