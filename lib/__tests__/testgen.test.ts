// Smoke test: each generator produces well-typed values without throwing.
// Not a property test of semantics -- just confirms the generators run.

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  arbAnalyticTableSchema,
  arbAstNode,
  arbDashboardConfig,
  arbPipelineConfig,
} from "../testgen";
import type { AstNode } from "../types/config";

/** Every AST node variant has a known `kind` tag. */
const KNOWN_AST_KINDS = new Set<AstNode["kind"]>([
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
]);

function assertKnownAstNode(node: AstNode): void {
  expect(KNOWN_AST_KINDS.has(node.kind)).toBe(true);
  // Recurse into child nodes.
  switch (node.kind) {
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
      assertKnownAstNode(node.left);
      assertKnownAstNode(node.right);
      break;
    case "concat":
      for (const a of node.args) assertKnownAstNode(a);
      break;
    case "upper":
    case "lower":
    case "trim":
    case "substring":
    case "parse_date":
    case "lookup_ref":
    case "cast":
      assertKnownAstNode(node.input);
      break;
    case "contains":
      assertKnownAstNode(node.input);
      assertKnownAstNode(node.pattern);
      break;
    case "if":
      assertKnownAstNode(node.cond);
      assertKnownAstNode(node.then);
      assertKnownAstNode(node.else);
      break;
    default:
      break;
  }
}

describe("fast-check generators smoke", () => {
  it("arbAstNode produces well-typed trees", () => {
    fc.assert(
      fc.property(arbAstNode, (node) => {
        assertKnownAstNode(node);
      }),
      { numRuns: 50 },
    );
  });

  it("arbPipelineConfig produces configs with required fields", () => {
    fc.assert(
      fc.property(arbPipelineConfig, (cfg) => {
        expect(cfg.version).toBe(1);
        expect(cfg.source_containers.length).toBeGreaterThanOrEqual(1);
        expect(cfg.mappings.length).toBeGreaterThanOrEqual(1);
        expect(cfg.analytic_tables.length).toBeGreaterThanOrEqual(1);
        // Every mapping column has an AST expression with a known kind.
        for (const m of cfg.mappings) {
          expect(m.columns.length).toBeGreaterThanOrEqual(1);
          for (const c of m.columns) assertKnownAstNode(c.expr);
        }
      }),
      { numRuns: 25 },
    );
  });

  it("arbDashboardConfig produces dashboards with at least one panel", () => {
    fc.assert(
      fc.property(arbDashboardConfig, (dash) => {
        expect(dash.panels.length).toBeGreaterThanOrEqual(1);
        for (const p of dash.panels) {
          expect([
            "kpi",
            "summary",
            "doughnut",
            "line",
            "bar",
            "table",
          ]).toContain(p.kind);
        }
      }),
      { numRuns: 25 },
    );
  });

  it("arbAnalyticTableSchema produces non-empty column lists", () => {
    fc.assert(
      fc.property(arbAnalyticTableSchema, (schema) => {
        expect(schema.length).toBeGreaterThanOrEqual(1);
        for (const col of schema) {
          expect(typeof col.name).toBe("string");
          expect(col.name.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 50 },
    );
  });
});
