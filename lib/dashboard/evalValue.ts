// Dashboard numeric value-expression evaluator.
//
// Panels that aggregate a numeric measure (`kpi.column`, `bar.value`,
// `doughnut.value`, `line.y`) accept either a plain column name (string) or
// a small arithmetic AstNode expression. This evaluates the expression
// subset that produces a number, so a panel can sum `-amount` or
// `inflow - outflow` without a precomputed column.
//
// Supported kinds: col, num, add, sub, mul, div, plus `if` with a boolean
// condition (eq/ne/gt/lt/ge/le over col/num/str/bool). Anything else throws
// UnsupportedValueNodeError. A null operand (missing column, non-numeric
// string) propagates as null; div-by-zero yields null.

import type { AstNode } from "@/lib/types/config";
import type { Row } from "@/components/dashboard/types";
import { toNum } from "./format";

/** A numeric measure field: a column name or an arithmetic expression. */
export type ValueField = string | AstNode;

export class UnsupportedValueNodeError extends Error {
  constructor(public kind: string) {
    super(`Unsupported AstNode in dashboard value expression: ${kind}`);
    this.name = "UnsupportedValueNodeError";
  }
}

type Scalar = string | number | boolean | null;

/** Evaluate a node to a comparable scalar (for use inside `if` conditions). */
function evalScalar(node: AstNode, row: Row): Scalar {
  switch (node.kind) {
    case "col": {
      const v = row[node.name];
      if (v === undefined || v === null) return null;
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
      if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();
      return null;
    }
    case "str":
      return node.value;
    case "num":
      return node.value;
    case "bool":
      return node.value;
    case "null":
      return null;
    default:
      // Arithmetic etc. are numeric; fall back to the numeric evaluator.
      return evalValue(node, row);
  }
}

/** Evaluate a boolean condition node (the `cond` of an `if`). */
function evalCondition(node: AstNode, row: Row): boolean {
  switch (node.kind) {
    case "eq":
    case "ne": {
      const l = evalScalar(node.left, row);
      const r = evalScalar(node.right, row);
      const equal =
        l !== null && r !== null && (typeof l === typeof r ? l === r : String(l) === String(r));
      return node.kind === "eq" ? equal : !equal;
    }
    case "gt":
    case "lt":
    case "ge":
    case "le": {
      const l = evalScalar(node.left, row);
      const r = evalScalar(node.right, row);
      if (l === null || r === null) return false;
      const a = typeof l === "number" ? l : Number(l);
      const b = typeof r === "number" ? r : Number(r);
      if (Number.isNaN(a) || Number.isNaN(b)) return false;
      switch (node.kind) {
        case "gt":
          return a > b;
        case "lt":
          return a < b;
        case "ge":
          return a >= b;
        case "le":
          return a <= b;
      }
    }
    // eslint-disable-next-line no-fallthrough
    case "bool":
      return node.value;
    default:
      throw new UnsupportedValueNodeError(node.kind);
  }
}

/** Evaluate a numeric value expression against a row. Returns null when the result isn't a finite number. */
export function evalValue(node: AstNode, row: Row): number | null {
  switch (node.kind) {
    case "col":
      return toNum(row[node.name]);
    case "num":
      return node.value;
    case "if":
      return evalCondition(node.cond, row)
        ? evalValue(node.then, row)
        : evalValue(node.else, row);
    case "add":
    case "sub":
    case "mul":
    case "div": {
      const l = evalValue(node.left, row);
      const r = evalValue(node.right, row);
      if (l === null || r === null) return null;
      switch (node.kind) {
        case "add":
          return l + r;
        case "sub":
          return l - r;
        case "mul":
          return l * r;
        case "div":
          return r === 0 ? null : l / r;
      }
    }
    // eslint-disable-next-line no-fallthrough
    default:
      throw new UnsupportedValueNodeError(node.kind);
  }
}

/**
 * Resolve a panel value field to a number for one row. A string field reads
 * that column; an AstNode field evaluates the expression.
 */
export function resolveValue(row: Row, field: ValueField): number | null {
  if (typeof field === "string") return toNum(row[field]);
  return evalValue(field, row);
}

/**
 * Column names referenced by a value field, for missing-column detection.
 * A string field is itself a column; an expression is walked for `col`s.
 */
export function valueFieldColumns(field: ValueField): string[] {
  if (typeof field === "string") return [field];
  const cols: string[] = [];
  const walk = (n: AstNode) => {
    switch (n.kind) {
      case "col":
        cols.push(n.name);
        break;
      case "add":
      case "sub":
      case "mul":
      case "div":
      case "eq":
      case "ne":
      case "gt":
      case "lt":
      case "ge":
      case "le":
        walk(n.left);
        walk(n.right);
        break;
      case "if":
        walk(n.cond);
        walk(n.then);
        walk(n.else);
        break;
      // num/str/bool/null and other leaves reference no columns.
    }
  };
  walk(field);
  return cols;
}
