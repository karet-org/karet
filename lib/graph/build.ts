// Build a React Flow graph from a `Pipeline_Config`.
//
// One node per Source_Container / Dimension / Mapping / Analytic_Table / Rollup,
// plus an edge per config reference: source→mapping, lookup root→mapping (from
// `dim_ref`s in column exprs; only root dimensions have nodes), mapping→table.
// Positions come from `cfg.layout[id]`, defaulting to `{ x: 0, y: 0 }`.

import type { Edge, Node } from "@xyflow/react";
import type {
  AnalyticTable,
  AstNode,
  Dimension,
  Mapping,
  PipelineConfig,
  Rollup,
  SourceContainer,
} from "../types/config";

export type SourceContainerNodeData = { kind: "source-container"; entity: SourceContainer };
export type DimensionNodeData = { kind: "dimension"; entity: Dimension };
export type MappingNodeData = { kind: "mapping"; entity: Mapping };
export type AnalyticTableNodeData = { kind: "analytic-table"; entity: AnalyticTable };
export type RollupNodeData = { kind: "rollup"; entity: Rollup };

type GraphNodeData =
  | SourceContainerNodeData
  | DimensionNodeData
  | MappingNodeData
  | AnalyticTableNodeData
  | RollupNodeData;

export type GraphNode = Node<GraphNodeData>;
export type GraphEdge = Edge;

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Node type tags wired to the React Flow custom node registry. */
export const NODE_TYPE = {
  sourceContainer: "source-container",
  dimension: "dimension",
  mapping: "mapping",
  analyticTable: "analytic-table",
  rollup: "rollup",
} as const;

/**
 * Collect the root id of every `dim_ref` in an AST. `dim_id` is a dotted
 * path (`categories.merchants`); only the root has a graph node.
 */
function collectDimIds(node: AstNode, out: Set<string>): void {
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
      collectDimIds(node.left, out);
      collectDimIds(node.right, out);
      return;
    case "concat":
    case "coalesce":
      for (const a of node.args) collectDimIds(a, out);
      return;
    case "upper":
    case "lower":
    case "trim":
    case "substring":
    case "parse_date":
    case "cast":
      collectDimIds(node.input, out);
      return;
    case "contains":
      collectDimIds(node.input, out);
      collectDimIds(node.pattern, out);
      return;
    case "if":
      collectDimIds(node.cond, out);
      collectDimIds(node.then, out);
      collectDimIds(node.else, out);
      return;
    case "dim_ref": {
      const root = dimensionId(node.dim_id);
      out.add(root);
      collectDimIds(node.input, out);
      return;
    }
  }
}

/** Portion of a dotted `dim_id` before the first dot. */
export function dimensionId(dimId: string): string {
  const dot = dimId.indexOf(".");
  return dot === -1 ? dimId : dimId.slice(0, dot);
}

export function buildGraph(cfg: PipelineConfig): Graph {
  const position = (id: string) => cfg.layout?.[id] ?? { x: 0, y: 0 };

  const nodes: GraphNode[] = [];

  for (const sc of cfg.source_containers ?? []) {
    nodes.push({
      id: sc.id,
      type: NODE_TYPE.sourceContainer,
      data: { kind: "source-container", entity: sc },
      position: position(sc.id),
      dragHandle: ".drag-handle",
    });
  }
  for (const lm of cfg.dimensions ?? []) {
    nodes.push({
      id: lm.id,
      type: NODE_TYPE.dimension,
      data: { kind: "dimension", entity: lm },
      position: position(lm.id),
      dragHandle: ".drag-handle",
    });
  }
  for (const m of cfg.mappings ?? []) {
    nodes.push({
      id: m.id,
      type: NODE_TYPE.mapping,
      data: { kind: "mapping", entity: m },
      position: position(m.id),
      dragHandle: ".drag-handle",
    });
  }
  for (const at of cfg.analytic_tables ?? []) {
    nodes.push({
      id: at.id,
      type: NODE_TYPE.analyticTable,
      data: { kind: "analytic-table", entity: at },
      position: position(at.id),
      dragHandle: ".drag-handle",
    });
  }

  for (const r of cfg.rollups ?? []) {
    nodes.push({
      id: r.id,
      type: NODE_TYPE.rollup,
      data: { kind: "rollup", entity: r },
      position: position(r.id),
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

  for (const m of cfg.mappings ?? []) {
    addEdge(m.source_container_id, m.id);
    addEdge(m.id, m.analytic_table_id);

    const lookupRoots = new Set<string>();
    for (const col of m.columns) collectDimIds(col.expr, lookupRoots);
    for (const root of lookupRoots) addEdge(root, m.id);
  }

  // A rollup reads one table and writes another.
  for (const r of cfg.rollups ?? []) {
    addEdge(r.source_table_id, r.id);
    addEdge(r.id, r.analytic_table_id);
  }

  return { nodes, edges };
}

/** Look up a single GraphNode by id without building edges. */
export function findNode(
  cfg: PipelineConfig,
  id: string,
): GraphNode | null {
  const position = cfg.layout?.[id] ?? { x: 0, y: 0 };
  const sc = (cfg.source_containers ?? []).find((x) => x.id === id);
  if (sc) return {
    id, type: NODE_TYPE.sourceContainer,
    data: { kind: "source-container", entity: sc },
    position, dragHandle: ".drag-handle",
  };
  const lm = (cfg.dimensions ?? []).find((x) => x.id === id);
  if (lm) return {
    id, type: NODE_TYPE.dimension,
    data: { kind: "dimension", entity: lm },
    position, dragHandle: ".drag-handle",
  };
  const m = (cfg.mappings ?? []).find((x) => x.id === id);
  if (m) return {
    id, type: NODE_TYPE.mapping,
    data: { kind: "mapping", entity: m },
    position, dragHandle: ".drag-handle",
  };
  const r = (cfg.rollups ?? []).find((x) => x.id === id);
  if (r) return {
    id, type: NODE_TYPE.rollup,
    data: { kind: "rollup", entity: r },
    position, dragHandle: ".drag-handle",
  };
  const at = (cfg.analytic_tables ?? []).find((x) => x.id === id);
  if (at) return {
    id, type: NODE_TYPE.analyticTable,
    data: { kind: "analytic-table", entity: at },
    position, dragHandle: ".drag-handle",
  };
  return null;
}
