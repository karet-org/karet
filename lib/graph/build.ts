// Build a React Flow graph from a `Pipeline_Config`.
//
// Emits one node per Source_Container, Lookup_Mapping, Mapping, and
// Analytic_Table; and one edge for each config reference:
//
//   - source_container_id → mapping_id      (per Mapping)
//   - lookup_root_id      → mapping_id      (per `lookup_ref` found in any
//                                            `MappingColumn.expr`; dedup per
//                                            mapping, and the root portion of
//                                            the dotted `lookup_id` is used
//                                            since only root Lookup_Mappings
//                                            have their own node)
//   - mapping_id          → analytic_table_id (per Mapping)
//
// Node positions come from `cfg.layout[id]` when present, otherwise default
// to `{ x: 0, y: 0 }`.

import type { Edge, Node } from "@xyflow/react";
import type {
  AnalyticTable,
  AstNode,
  LookupMapping,
  Mapping,
  PipelineConfig,
  SourceContainer,
} from "../types/config";

export type SourceContainerNodeData = { kind: "source-container"; entity: SourceContainer };
export type LookupMappingNodeData = { kind: "lookup-mapping"; entity: LookupMapping };
export type MappingNodeData = { kind: "mapping"; entity: Mapping };
export type AnalyticTableNodeData = { kind: "analytic-table"; entity: AnalyticTable };

export type GraphNodeData =
  | SourceContainerNodeData
  | LookupMappingNodeData
  | MappingNodeData
  | AnalyticTableNodeData;

export type GraphNode = Node<GraphNodeData>;
export type GraphEdge = Edge;

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Node type tag strings (stable; wired to React Flow custom node registry). */
export const NODE_TYPE = {
  sourceContainer: "source-container",
  lookupMapping: "lookup-mapping",
  mapping: "mapping",
  analyticTable: "analytic-table",
} as const;

/**
 * Recursively walk an `AstNode`, collecting the root id for every
 * `lookup_ref` encountered. The `lookup_id` uses dotted-path syntax
 * (e.g. `categories.merchants`); the root (before the first dot) identifies
 * the Lookup_Mapping node in the graph.
 */
function collectLookupRootIds(node: AstNode, out: Set<string>): void {
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
      collectLookupRootIds(node.left, out);
      collectLookupRootIds(node.right, out);
      return;
    case "concat":
    case "coalesce":
      for (const a of node.args) collectLookupRootIds(a, out);
      return;
    case "upper":
    case "lower":
    case "trim":
    case "substring":
    case "parse_date":
    case "cast":
      collectLookupRootIds(node.input, out);
      return;
    case "contains":
      collectLookupRootIds(node.input, out);
      collectLookupRootIds(node.pattern, out);
      return;
    case "if":
      collectLookupRootIds(node.cond, out);
      collectLookupRootIds(node.then, out);
      collectLookupRootIds(node.else, out);
      return;
    case "lookup_ref": {
      const root = rootLookupId(node.lookup_id);
      out.add(root);
      collectLookupRootIds(node.input, out);
      return;
    }
  }
}

/** Portion of a dotted `lookup_id` before the first dot. */
export function rootLookupId(lookupId: string): string {
  const dot = lookupId.indexOf(".");
  return dot === -1 ? lookupId : lookupId.slice(0, dot);
}

/** Build the React Flow graph for the given `PipelineConfig`. */
export function buildGraph(cfg: PipelineConfig): Graph {
  const position = (id: string) => cfg.layout?.[id] ?? { x: 0, y: 0 };

  const nodes: GraphNode[] = [];

  for (const sc of cfg.source_containers) {
    nodes.push({
      id: sc.id,
      type: NODE_TYPE.sourceContainer,
      data: { kind: "source-container", entity: sc },
      position: position(sc.id),
      dragHandle: ".drag-handle",
    });
  }
  for (const lm of cfg.lookup_mappings) {
    nodes.push({
      id: lm.id,
      type: NODE_TYPE.lookupMapping,
      data: { kind: "lookup-mapping", entity: lm },
      position: position(lm.id),
      dragHandle: ".drag-handle",
    });
  }
  for (const m of cfg.mappings) {
    nodes.push({
      id: m.id,
      type: NODE_TYPE.mapping,
      data: { kind: "mapping", entity: m },
      position: position(m.id),
      dragHandle: ".drag-handle",
    });
  }
  for (const at of cfg.analytic_tables) {
    nodes.push({
      id: at.id,
      type: NODE_TYPE.analyticTable,
      data: { kind: "analytic-table", entity: at },
      position: position(at.id),
      dragHandle: ".drag-handle",
    });
  }

  const edges: GraphEdge[] = [];
  const edgeIds = new Set<string>();

  const addEdge = (source: string, target: string): void => {
    const id = `${source}->${target}`;
    if (edgeIds.has(id)) return;
    edgeIds.add(id);
    edges.push({ id, source, target });
  };

  for (const m of cfg.mappings) {
    addEdge(m.source_container_id, m.id);
    addEdge(m.id, m.analytic_table_id);

    const lookupRoots = new Set<string>();
    for (const col of m.columns) collectLookupRootIds(col.expr, lookupRoots);
    for (const root of lookupRoots) addEdge(root, m.id);
  }

  return { nodes, edges };
}

/** Look up a single GraphNode by id without building edges. */
export function findNode(
  cfg: PipelineConfig,
  id: string,
): GraphNode | null {
  const position = cfg.layout?.[id] ?? { x: 0, y: 0 };
  const sc = cfg.source_containers.find((x) => x.id === id);
  if (sc) return {
    id, type: NODE_TYPE.sourceContainer,
    data: { kind: "source-container", entity: sc },
    position, dragHandle: ".drag-handle",
  };
  const lm = cfg.lookup_mappings.find((x) => x.id === id);
  if (lm) return {
    id, type: NODE_TYPE.lookupMapping,
    data: { kind: "lookup-mapping", entity: lm },
    position, dragHandle: ".drag-handle",
  };
  const m = cfg.mappings.find((x) => x.id === id);
  if (m) return {
    id, type: NODE_TYPE.mapping,
    data: { kind: "mapping", entity: m },
    position, dragHandle: ".drag-handle",
  };
  const at = cfg.analytic_tables.find((x) => x.id === id);
  if (at) return {
    id, type: NODE_TYPE.analyticTable,
    data: { kind: "analytic-table", entity: at },
    position, dragHandle: ".drag-handle",
  };
  return null;
}
