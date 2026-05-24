// Round-trip property: every AST tree, when rendered via `astExpression`,
// parses back to a structurally-equal tree.
//
// This is the load-bearing invariant that lets `MappingEditor` use the
// rendered text as the editable textarea contents. Two regressions
// would have been caught by this earlier:
//
//   1. Column names with non-identifier characters (spaces, leading
//      whitespace) used to round-trip through bare `col(name)`, which
//      tokenized as multiple identifiers and failed to parse.
//
//   2. Deeply nested expressions (e.g. coalesce(lookup_ref(merchants,
//      upper(trim(col(...))))) ) used to be truncated with `…` by
//      `astSummary` -- fine for graph-node display, fatal when the
//      same string was fed back to the parser.

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { AstNode } from "@/lib/types/config";
import { astExpression } from "@/components/graph/astSummary";
import { parseExpression } from "@/lib/graph/expressionParser";
import { arbAstNode } from "@/lib/testgen";

/**
 * Normalize floating-point Num literals so equality holds when the
 * parser's `Number(t.value)` round-trip introduces tiny precision
 * differences. We don't lose meaningful information -- the worker
 * uses f64 too -- but `0.1 + 0.2 !== 0.3` style comparisons are noise.
 */
function normalize(node: AstNode): AstNode {
  if (node.kind === "num") {
    // Use the JSON-serialized form on both sides; this collapses
    // representations like `0.10000000000000001` -> `0.1`.
    return { kind: "num", value: Number(JSON.stringify(node.value)) };
  }
  // Recurse, preserving the discriminator structure.
  const out: Record<string, unknown> = { ...node };
  for (const [k, v] of Object.entries(node)) {
    if (v && typeof v === "object" && "kind" in v) {
      out[k] = normalize(v as AstNode);
    } else if (Array.isArray(v)) {
      out[k] = v.map((item) =>
        item && typeof item === "object" && "kind" in item
          ? normalize(item as AstNode)
          : item,
      );
    }
  }
  return out as AstNode;
}

describe("astExpression / parseExpression round-trip", () => {
  it("astExpression(node) parses back to a structurally-equal node", () => {
    fc.assert(
      fc.property(arbAstNode, (node) => {
        const text = astExpression(node);
        const parsed = parseExpression(text);
        if (!parsed.ok) {
          throw new Error(
            `parse failed for AST: kind=${node.kind}\nrendered: ${text}\nerror: ${parsed.error}`,
          );
        }
        expect(normalize(parsed.value)).toEqual(normalize(node));
      }),
      { numRuns: 200 },
    );
  });

  // -----------------------------------------------------------------
  // Targeted regressions for the two bugs the property test caught.
  // -----------------------------------------------------------------

  it("renders + reparses col() with a name containing whitespace", () => {
    const node: AstNode = {
      kind: "upper",
      input: {
        kind: "trim",
        input: { kind: "col", name: " Transaction Details" },
      },
    };
    const text = astExpression(node);
    expect(text).toContain('col(" Transaction Details")');
    const parsed = parseExpression(text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value).toEqual(node);
  });

  it("renders + reparses a deeply-nested coalesce(lookup_ref, fallback)", () => {
    const node: AstNode = {
      kind: "coalesce",
      args: [
        {
          kind: "lookup_ref",
          lookup_id: "merchants",
          input: {
            kind: "upper",
            input: {
              kind: "trim",
              input: { kind: "col", name: "Description" },
            },
          },
        },
        {
          kind: "upper",
          input: {
            kind: "trim",
            input: { kind: "col", name: "Description" },
          },
        },
      ],
    };
    const text = astExpression(node);
    // Concrete shape: no ellipses, no truncation.
    expect(text).not.toContain("…");
    const parsed = parseExpression(text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value).toEqual(node);
  });
});
