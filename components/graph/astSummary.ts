// Render a compact one-line summary of an `AstNode` tree, e.g.
//   upper(concat(col(a), col(b)))
//   lookup_ref(categories, col(description))
//
// Used by `MappingNode` to show at-a-glance what each output column does
// without forcing the graph to re-render the full tree editor.

import type { AstNode } from "@/lib/types/config";

/** Maximum nested depth we expand before emitting `…`. */
const MAX_DEPTH = 3;

/** Maximum args rendered in a `concat` before truncation. */
const MAX_CONCAT_ARGS = 3;

export function astSummary(node: AstNode, depth = 0): string {
  if (depth >= MAX_DEPTH) return "…";
  switch (node.kind) {
    case "col":
      return node.name;
    case "str":
      return JSON.stringify(node.value);
    case "num":
      return String(node.value);
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
      return `${node.kind}(${astSummary(node.left, depth + 1)}, ${astSummary(node.right, depth + 1)})`;
    case "concat": {
      const args = node.args.slice(0, MAX_CONCAT_ARGS).map((a) => astSummary(a, depth + 1));
      if (node.args.length > MAX_CONCAT_ARGS) args.push("…");
      return `concat(${args.join(", ")})`;
    }
    case "upper":
    case "lower":
    case "trim":
      return `${node.kind}(${astSummary(node.input, depth + 1)})`;
    case "parse_date":
      return `parse_date(${astSummary(node.input, depth + 1)}, "${node.format}")`;
    case "cast":
      return `cast(${astSummary(node.input, depth + 1)}, "${node.to}")`;
    case "contains":
      return `contains(${astSummary(node.input, depth + 1)}, ${astSummary(node.pattern, depth + 1)})`;
    case "if":
      return `if(${astSummary(node.cond, depth + 1)}, ${astSummary(node.then, depth + 1)}, ${astSummary(node.else, depth + 1)})`;
    case "lookup_ref":
      return `lookup_ref(${node.lookup_id}, ${astSummary(node.input, depth + 1)})`;
    case "substring": {
      const args = [astSummary(node.input, depth + 1), String(node.start)];
      if (node.length != null) args.push(String(node.length));
      return `substring(${args.join(", ")})`;
    }
  }
}
