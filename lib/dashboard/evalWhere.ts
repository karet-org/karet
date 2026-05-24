// Dashboard `where` clause evaluator.
//
// `where` is an array of AstNode predicates ANDed together. Only the
// boolean / value-producing subset of AstNode is supported; arithmetic,
// `parse_date`, `lookup_ref`, `cast`, `if`, `concat`, and `substring`
// throw `UnsupportedWhereNodeError`.
//
// Three-valued logic on null:
//   - `null == X`           -> false (matches SQL)
//   - `null != X`           -> true. Diverges from SQL on purpose: a
//                              `category != "X"` filter shouldn't drop
//                              rows whose category is null because the
//                              parquet hasn't been re-categorized yet.
//   - other comparisons     -> false

import type { AstNode } from "@/lib/types/config";
import type { Row } from "@/components/dashboard/types";

type Value = string | number | boolean | Date | null;

export class UnsupportedWhereNodeError extends Error {
  constructor(public kind: string) {
    super(`Unsupported AstNode in dashboard where clause: ${kind}`);
    this.name = "UnsupportedWhereNodeError";
  }
}

/** Filter `rows` to those satisfying every `where` predicate. */
export function applyWhere(rows: Row[], where: AstNode[] | undefined): Row[] {
  if (!where || where.length === 0) return rows;
  return rows.filter((row) => where.every((p) => isTruthy(evalNode(p, row))));
}

function isTruthy(v: Value): boolean {
  if (v === null) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0 && !Number.isNaN(v);
  if (typeof v === "string") return v.length > 0;
  return !Number.isNaN(v.getTime()); // Date
}

/** Evaluate one node against `row`. Exposed for tests. */
export function evalNode(node: AstNode, row: Row): Value {
  switch (node.kind) {
    case "col": {
      const v = row[node.name];
      if (v === undefined || v === null) return null;
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
      if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
      // Unknown shape (object/array): fail closed.
      return null;
    }
    case "str": return node.value;
    case "num": return node.value;
    case "bool": return node.value;
    case "null": return null;

    case "eq": return cmpEq(evalNode(node.left, row), evalNode(node.right, row));
    case "ne": return cmpNe(evalNode(node.left, row), evalNode(node.right, row));
    case "gt": return cmpOrd(evalNode(node.left, row), evalNode(node.right, row), (a, b) => a > b);
    case "lt": return cmpOrd(evalNode(node.left, row), evalNode(node.right, row), (a, b) => a < b);
    case "ge": return cmpOrd(evalNode(node.left, row), evalNode(node.right, row), (a, b) => a >= b);
    case "le": return cmpOrd(evalNode(node.left, row), evalNode(node.right, row), (a, b) => a <= b);

    case "contains": {
      const haystack = evalNode(node.input, row);
      const needle = evalNode(node.pattern, row);
      if (haystack === null || needle === null) return false;
      return String(haystack).includes(String(needle));
    }

    case "upper": {
      const v = evalNode(node.input, row);
      return v === null ? null : String(v).toUpperCase();
    }
    case "lower": {
      const v = evalNode(node.input, row);
      return v === null ? null : String(v).toLowerCase();
    }
    case "trim": {
      const v = evalNode(node.input, row);
      return v === null ? null : String(v).trim();
    }

    case "coalesce": {
      for (const arg of node.args) {
        const v = evalNode(arg, row);
        if (v !== null) return v;
      }
      return null;
    }

    default:
      throw new UnsupportedWhereNodeError(node.kind);
  }
}

function cmpEq(a: Value, b: Value): boolean {
  if (a === null || b === null) return false;
  return cmpEqNonNull(a, b);
}

function cmpNe(a: Value, b: Value): boolean {
  if (a === null || b === null) return true;
  return !cmpEqNonNull(a, b);
}

function cmpEqNonNull(a: NonNullable<Value>, b: NonNullable<Value>): boolean {
  if (a instanceof Date || b instanceof Date) {
    const ta = a instanceof Date ? a.getTime() : toDateMs(a);
    const tb = b instanceof Date ? b.getTime() : toDateMs(b);
    if (ta === null || tb === null) return false;
    return ta === tb;
  }
  if (typeof a === typeof b) return a === b;
  return String(a) === String(b);
}

function cmpOrd(
  a: Value,
  b: Value,
  op: (x: number | string, y: number | string) => boolean,
): boolean {
  if (a === null || b === null) return false;
  if (a instanceof Date || b instanceof Date) {
    const ta = a instanceof Date ? a.getTime() : toDateMs(a);
    const tb = b instanceof Date ? b.getTime() : toDateMs(b);
    if (ta === null || tb === null) return false;
    return op(ta, tb);
  }
  if (typeof a === "number" && typeof b === "number") return op(a, b);
  if (typeof a === "boolean" || typeof b === "boolean") {
    return op(Number(a), Number(b));
  }
  return op(String(a), String(b));
}

function toDateMs(v: Value): number | null {
  if (v === null) return null;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const t = new Date(v).getTime();
    return Number.isNaN(t) ? null : t;
  }
  return null;
}
