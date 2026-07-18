// Auto-layout for the Data Flow Graph using dagre (LR direction).
// Positions are translated from dagre's center-origin to React Flow's
// top-left origin before returning.

import dagre from "dagre";
import type { LayoutPosition, PipelineConfig } from "../types/config";
import type { GraphEdge, GraphNode } from "./build";

/** Horizontal and vertical spacing between dagre ranks / nodes. */
const RANK_SEP = 160;
const NODE_SEP = 80;

// Content-based width/height estimates so dagre allocates enough space
// per node, the real cards grow with schema/column/keyword counts, and
// feeding dagre a flat 220x80 produces overlapping cards.
//
// Tuned to match the rendered Tailwind cards: ~28px header + ~22px title
// + list rows of ~18px each, plus a few pixels of padding.
const HEADER_PX = 28;
const TITLE_PX = 22;
const LIST_ROW_PX = 18;
const LIST_VPAD_PX = 16;
const PILL_ROW_PX = 26;
const MIN_NODE_HEIGHT = 96;

// Widths per `min-w-[...]` in the custom node components, plus a small
// buffer for borders, handles, and wider content.
const SOURCE_WIDTH = 240;
const LOOKUP_WIDTH = 240;
const MAPPING_WIDTH = 340;
const TABLE_WIDTH = 240;

function estimateNodeWidth(n: GraphNode): number {
  const explicit = (n as { width?: number }).width;
  if (typeof explicit === "number") return explicit;
  switch (n.data.kind) {
    case "source-container":
      return SOURCE_WIDTH;
    case "lookup-mapping":
      return LOOKUP_WIDTH;
    case "mapping":
      return MAPPING_WIDTH;
    case "analytic-table":
      return TABLE_WIDTH;
  }
}

function estimateNodeHeight(n: GraphNode): number {
  const explicit = (n as { height?: number }).height;
  if (typeof explicit === "number") return explicit;

  const data = n.data;
  let rows = 1;
  switch (data.kind) {
    case "source-container":
      rows = data.entity.schema.length;
      break;
    case "analytic-table":
      rows = data.entity.schema.length;
      break;
    case "mapping":
      rows = data.entity.columns.length;
      break;
    case "lookup-mapping": {
      // Keyword pills wrap; estimate ~1 line per ~6 pills.
      const pillCount = data.entity.rows.reduce(
        (n, r) => n + r.input_patterns.length,
        0,
      );
      rows = Math.max(1, Math.ceil(pillCount / 6));
      break;
    }
  }
  const rowPx = data.kind === "lookup-mapping" ? PILL_ROW_PX : LIST_ROW_PX;
  const body = TITLE_PX + LIST_VPAD_PX + rows * rowPx;
  return Math.max(MIN_NODE_HEIGHT, HEADER_PX + body);
}

export interface AutoLayoutOptions {
  /** Horizontal gap between ranks (default 160). */
  rankSep?: number;
  /** Vertical gap between nodes within a rank (default 80). */
  nodeSep?: number;
}

/** A node annotated with its computed top-left `position`. */
export type PositionedNode = GraphNode;

/**
 * Lay out a set of nodes and edges left-to-right using dagre.
 *
 * Returns a new array of nodes (same length, same ids) with `position`
 * overwritten. Input nodes are not mutated.
 */
export function autoLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  options: AutoLayoutOptions = {},
): PositionedNode[] {
  const g = new dagre.graphlib.Graph({ directed: true, multigraph: false });
  g.setGraph({
    rankdir: "LR",
    nodesep: options.nodeSep ?? NODE_SEP,
    ranksep: options.rankSep ?? RANK_SEP,
    marginx: 0,
    marginy: 0,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of nodes) {
    const w = estimateNodeWidth(n);
    const h = estimateNodeHeight(n);
    // Assign rank based on node type so disconnected nodes still spread horizontally
    const rank = n.data.kind === "source-container" ? 0
      : n.data.kind === "lookup-mapping" ? 0
      : n.data.kind === "mapping" ? 1
      : 2; // analytic-table
    g.setNode(n.id, { width: w, height: h, rank });
  }

  // Add invisible edges between type-rank anchors so dagre respects the column order
  // even for disconnected nodes. We create hidden anchor nodes per rank and connect them.
  const anchors = ["__anchor_0", "__anchor_1", "__anchor_2"];
  for (const a of anchors) g.setNode(a, { width: 1, height: 1 });
  g.setEdge("__anchor_0", "__anchor_1");
  g.setEdge("__anchor_1", "__anchor_2");
  // Connect each real node to its rank anchor with a hidden edge
  for (const n of nodes) {
    const rank = n.data.kind === "source-container" || n.data.kind === "lookup-mapping" ? 0
      : n.data.kind === "mapping" ? 1 : 2;
    g.setEdge(anchors[rank], n.id, { weight: 0, minlen: 0 });
  }

  // Dagre requires both endpoints to be registered as nodes. Any edge that
  // references an unknown id is skipped defensively (the caller built the
  // graph via `buildGraph`, so this is only a guard).
  for (const e of edges) {
    if (!g.hasNode(e.source) || !g.hasNode(e.target)) continue;
    g.setEdge(e.source, e.target);
  }

  dagre.layout(g);

  return nodes.map((n) => {
    const laid = g.node(n.id);
    // Dagre centers on (x, y); React Flow wants top-left.
    const w = laid.width ?? estimateNodeWidth(n);
    const h = laid.height ?? estimateNodeHeight(n);
    return {
      ...n,
      position: { x: laid.x - w / 2, y: laid.y - h / 2 },
    };
  });
}

/**
 * Merge positioned nodes into `cfg.layout` so that the positions round-trip
 * through S3 (`GET /api/config` → layout → `PUT /api/config`). Returns a new
 * `PipelineConfig`; the input config is not mutated.
 */
export function layoutToConfig(
  cfg: PipelineConfig,
  positioned: PositionedNode[],
): PipelineConfig {
  const layout: Record<string, LayoutPosition> = { ...(cfg.layout ?? {}) };
  for (const n of positioned) {
    layout[n.id] = { x: n.position.x, y: n.position.y };
  }
  return { ...cfg, layout };
}
