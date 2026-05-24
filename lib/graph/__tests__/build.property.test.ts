// Graph rendering contains a node per config entity
// Graph rendering contains an edge per config reference
//
// Generates random Pipeline_Configs via the shared `arbPipelineConfig`
// generator and asserts that `buildGraph` produces the node and edge sets
// specified in the design.
//

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { AstNode, Mapping, PipelineConfig } from "../../types/config";
import { arbPipelineConfig } from "../../testgen";
import { buildGraph, NODE_TYPE, rootLookupId } from "../build";

/** Collect root lookup ids referenced by a mapping (dedup across columns). */
function mappingLookupRoots(m: Mapping): Set<string> {
  const roots = new Set<string>();
  const walk = (node: AstNode): void => {
    switch (node.kind) {
      case "col":
      case "str":
      case "num":
      case "bool":
      case "null":
        return;
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
        walk(node.left);
        walk(node.right);
        return;
      case "concat":
      case "coalesce":
        for (const a of node.args) walk(a);
        return;
      case "upper":
      case "lower":
      case "trim":
      case "substring":
      case "parse_date":
      case "cast":
        walk(node.input);
        return;
      case "contains":
        walk(node.input);
        walk(node.pattern);
        return;
      case "if":
        walk(node.cond);
        walk(node.then);
        walk(node.else);
        return;
      case "lookup_ref":
        roots.add(rootLookupId(node.lookup_id));
        walk(node.input);
        return;
    }
  };
  for (const col of m.columns) walk(col.expr);
  return roots;
}

/** Expected edge-id multiset `${source}->${target}` for a config. */
function expectedEdgeIds(cfg: PipelineConfig): Set<string> {
  const ids = new Set<string>();
  for (const m of cfg.mappings) {
    ids.add(`${m.source_container_id}->${m.id}`);
    ids.add(`${m.id}->${m.analytic_table_id}`);
    for (const root of mappingLookupRoots(m)) ids.add(`${root}->${m.id}`);
  }
  return ids;
}

describe("Graph rendering contains a node per config entity", () => {
  it("emits exactly one node per source, lookup, mapping, and analytic table with the right type tag", () => {
    fc.assert(
      fc.property(arbPipelineConfig, (cfg) => {
        const { nodes } = buildGraph(cfg);

        const totalExpected =
          cfg.source_containers.length +
          cfg.lookup_mappings.length +
          cfg.mappings.length +
          cfg.analytic_tables.length;
        expect(nodes.length).toBe(totalExpected);

        const byId = new Map(nodes.map((n) => [n.id, n] as const));

        for (const sc of cfg.source_containers) {
          const node = byId.get(sc.id);
          expect(node, `missing source-container node ${sc.id}`).toBeDefined();
          expect(node!.type).toBe(NODE_TYPE.sourceContainer);
        }
        for (const lm of cfg.lookup_mappings) {
          const node = byId.get(lm.id);
          expect(node, `missing lookup-mapping node ${lm.id}`).toBeDefined();
          expect(node!.type).toBe(NODE_TYPE.lookupMapping);
        }
        for (const m of cfg.mappings) {
          const node = byId.get(m.id);
          expect(node, `missing mapping node ${m.id}`).toBeDefined();
          expect(node!.type).toBe(NODE_TYPE.mapping);
        }
        for (const at of cfg.analytic_tables) {
          const node = byId.get(at.id);
          expect(node, `missing analytic-table node ${at.id}`).toBeDefined();
          expect(node!.type).toBe(NODE_TYPE.analyticTable);
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe("Graph rendering contains an edge per config reference", () => {
  it("edge id set equals the union of source→mapping, lookup_root→mapping, mapping→analytic_table", () => {
    fc.assert(
      fc.property(arbPipelineConfig, (cfg) => {
        const { edges } = buildGraph(cfg);

        const actual = new Set(edges.map((e) => e.id));
        const expected = expectedEdgeIds(cfg);

        // Edge ids are `${source}->${target}`; matching the id set is
        // equivalent to matching the (source, target) pair set.
        expect(actual).toEqual(expected);

        // And each edge's source/target agree with its id.
        for (const e of edges) {
          expect(`${e.source}->${e.target}`).toBe(e.id);
        }
      }),
      { numRuns: 100 },
    );
  });
});
