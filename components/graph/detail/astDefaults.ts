// Default-shape constructors for each `AstNode` kind.
//
// When the user swaps a node's `kind` in the structural editor, the editor
// rewrites the sub-tree to the new default so illegal states are
// unrepresentable. Kept separate from the editor component so property
// tests and the AST-JSON parser can share the taxonomy.

import type { AstNode } from "@/lib/types/config";

/**
 * Every supported AST node kind. Listed in the order presented to the user
 * by the `kind` dropdown.
 */
export const AST_KINDS = [
  "col",
  "str",
  "num",
  "bool",
  "null",
  "add",
  "sub",
  "mul",
  "div",
  "concat",
  "coalesce",
  "upper",
  "lower",
  "trim",
  "substring",
  "eq",
  "ne",
  "gt",
  "lt",
  "ge",
  "le",
  "contains",
  "if",
  "parse_date",
  "lookup_ref",
  "cast",
] as const;

export type AstKind = (typeof AST_KINDS)[number];

/** Leaf defaults reused by every binary/unary combinator. */
const DEFAULT_LEAF_NUM: AstNode = { kind: "num", value: 0 };
const DEFAULT_LEAF_COL: AstNode = { kind: "col", name: "" };
const DEFAULT_LEAF_BOOL: AstNode = { kind: "bool", value: true };
const DEFAULT_LEAF_STR: AstNode = { kind: "str", value: "" };

/**
 * Return a freshly-allocated default `AstNode` for the given kind. Every
 * call returns a new object graph so sharing between rows can't leak.
 */
export function defaultAst(kind: AstKind): AstNode {
  switch (kind) {
    case "col":
      return { kind: "col", name: "" };
    case "str":
      return { kind: "str", value: "" };
    case "num":
      return { kind: "num", value: 0 };
    case "bool":
      return { kind: "bool", value: true };
    case "null":
      return { kind: "null" };
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
      return {
        kind,
        left: { ...DEFAULT_LEAF_NUM },
        right: { ...DEFAULT_LEAF_NUM },
      };
    case "concat":
      return { kind: "concat", sep: " ", args: [] };
    case "coalesce":
      // Two empty leaves so the user immediately sees both arg slots.
      // Common usage is a 2-arg coalesce(primary, fallback).
      return {
        kind: "coalesce",
        args: [{ ...DEFAULT_LEAF_STR }, { ...DEFAULT_LEAF_STR }],
      };
    case "upper":
    case "lower":
    case "trim":
      return { kind, input: { ...DEFAULT_LEAF_STR } };
    case "substring":
      return {
        kind: "substring",
        input: { ...DEFAULT_LEAF_STR },
        start: 0,
        length: null,
      };
    case "contains":
      return {
        kind: "contains",
        input: { ...DEFAULT_LEAF_STR },
        pattern: { ...DEFAULT_LEAF_STR },
      };
    case "if":
      return {
        kind: "if",
        cond: { ...DEFAULT_LEAF_BOOL },
        then: { ...DEFAULT_LEAF_NUM },
        else: { ...DEFAULT_LEAF_NUM },
      };
    case "parse_date":
      return {
        kind: "parse_date",
        input: { ...DEFAULT_LEAF_STR },
        format: "%Y-%m-%d",
      };
    case "lookup_ref":
      return {
        kind: "lookup_ref",
        lookup_id: "",
        input: { ...DEFAULT_LEAF_COL },
      };
    case "cast":
      return { kind: "cast", input: { ...DEFAULT_LEAF_NUM }, to: "string" };
  }
}
