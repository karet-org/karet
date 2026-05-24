// Render an `AstNode` tree as a one-line string.
//
// - `astSummary`: display form, depth-bounded, ellipsizes past the limit.
//   Used by `MappingNode` for at-a-glance summaries.
// - `astExpression`: lossless form, guaranteed to round-trip through
//   `parseExpression`. Used by `MappingEditor` for textarea contents
//   and validation.
//
// Must stay aligned with `lib/graph/expressionParser.ts`.

import type { AstNode } from "@/lib/types/config";

const MAX_DEPTH = 3;
const MAX_CONCAT_ARGS = 3;

/** Bare identifier the parser tokenizes as one ident, vs. needing `col("...")`. */
function isBareIdentifier(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(name);
}

function renderCol(name: string): string {
  return isBareIdentifier(name) ? name : `col(${JSON.stringify(name)})`;
}

export function astSummary(node: AstNode, depth = 0): string {
  if (depth >= MAX_DEPTH) return "…";
  return renderAst(node, depth, /* truncate */ true);
}

export function astExpression(node: AstNode): string {
  return renderAst(node, 0, /* truncate */ false);
}

/** Render an array of arg nodes, optionally truncated with `…`. */
function renderArgs(
  args: AstNode[],
  depth: number,
  truncate: boolean,
): string[] {
  const slice = truncate ? args.slice(0, MAX_CONCAT_ARGS) : args;
  const out = slice.map((a) => recurse(a, depth, truncate));
  if (truncate && args.length > MAX_CONCAT_ARGS) out.push("…");
  return out;
}

function renderAst(node: AstNode, depth: number, truncate: boolean): string {
  switch (node.kind) {
    case "col":
      return renderCol(node.name);
    case "str":
      return JSON.stringify(node.value);
    case "num":
    case "bool":
      return String(node.value);
    case "null":
      return "null";
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
      return `${node.kind}(${recurse(node.left, depth, truncate)}, ${recurse(node.right, depth, truncate)})`;
    case "concat":
      // Parser shape: `concat("sep", a, b, ...)`.
      return `concat(${[JSON.stringify(node.sep), ...renderArgs(node.args, depth, truncate)].join(", ")})`;
    case "coalesce":
      return `coalesce(${renderArgs(node.args, depth, truncate).join(", ")})`;
    case "upper":
    case "lower":
    case "trim":
      return `${node.kind}(${recurse(node.input, depth, truncate)})`;
    case "parse_date":
      return `parse_date(${recurse(node.input, depth, truncate)}, ${JSON.stringify(node.format)})`;
    case "cast":
      return `cast(${recurse(node.input, depth, truncate)}, ${JSON.stringify(node.to)})`;
    case "contains":
      return `contains(${recurse(node.input, depth, truncate)}, ${recurse(node.pattern, depth, truncate)})`;
    case "if":
      return `if(${recurse(node.cond, depth, truncate)}, ${recurse(node.then, depth, truncate)}, ${recurse(node.else, depth, truncate)})`;
    case "lookup_ref":
      return `lookup_ref(${JSON.stringify(node.lookup_id)}, ${recurse(node.input, depth, truncate)})`;
    case "substring": {
      const args = [recurse(node.input, depth, truncate), String(node.start)];
      if (node.length != null) args.push(String(node.length));
      return `substring(${args.join(", ")})`;
    }
  }
}

function recurse(node: AstNode, parentDepth: number, truncate: boolean): string {
  if (truncate) return astSummary(node, parentDepth + 1);
  return renderAst(node, parentDepth + 1, false);
}
