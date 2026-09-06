"use client";

// GraphCanvas, React Flow wrapper for the Data Flow Graph.

import { forwardRef, useCallback, useImperativeHandle, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeMarkerType,
  type EdgeMouseHandler,
  MarkerType,
  type NodeChange,
  type NodeMouseHandler,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { NODE_TYPE, type GraphEdge, type GraphNode } from "@/lib/graph/build";
import { autoLayout } from "@/lib/graph/layout";
import type { NodeKind } from "@/lib/graph/nodeDefaults";
import SourceContainerNode from "./SourceContainerNode";
import LookupMappingNode from "./LookupMappingNode";
import MappingNode from "./MappingNode";
import AnalyticTableNode from "./AnalyticTableNode";
import { IconSource, IconLookup, IconMapping, IconTable, IconTrash, IconPlay,
} from "@/components/icons";
import Modal from "@/components/ui/Modal";

export interface GraphCanvasHandle {
  setGraph: (nodes: GraphNode[], edges: GraphEdge[]) => void;
  /** Add/update nodes and edges without replacing the entire graph. */
  updateGraph: (nodes: GraphNode[], edges: GraphEdge[]) => void;
}

export interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick?: (nodeId: string) => void;
  onPaneClick?: () => void;
  onLayout?: (nodes: GraphNode[]) => void;
  onNodeDragStop?: (nodes: GraphNode[]) => void;
  onAddNode?: (kind: NodeKind, position: { x: number; y: number }) => void;
  onConnect?: (sourceId: string, targetId: string) => void;
  onDeleteNode?: (nodeId: string) => void;
  /**
   * Compute the cascading damage that deleting the given node would
   * cause. The canvas calls this when the delete-confirm modal opens
   * so the user can see disconnected mappings and broken expressions
   * before committing. Optional: omit to skip the preview.
   */
  analyzeDeleteImpact?: (nodeId: string) => DeleteImpactSummary;
  /**
   * Remove an edge from the underlying config. Only fired for edges whose
   * kind maps to a direct config field (source→mapping, mapping→table).
   * Lookup→mapping edges are implicit from the mapping's AST and are not
   * disconnectable from the graph canvas.
   */
  onDisconnectEdge?: (edge: { id: string; source: string; target: string }) => void;
  /**
   * Trigger a pipeline run from the canvas toolbar. Optional: omit to
   * hide the run button.
   */
  onRun?: () => void;
}

export interface DeleteImpactSummary {
  disconnectedMappings: { id: string; name: string }[];
  disconnectedTables: { id: string; name: string }[];
  brokenExpressions: { mappingId: string; mappingName: string; columnName: string }[];
}

/** Static map used to register the four custom node types with React Flow. */
const nodeTypes: NodeTypes = {
  [NODE_TYPE.sourceContainer]: SourceContainerNode,
  [NODE_TYPE.lookupMapping]: LookupMappingNode,
  [NODE_TYPE.mapping]: MappingNode,
  [NODE_TYPE.analyticTable]: AnalyticTableNode,
};

/** Edge kind derived from the source/target node types. */
type EdgeKind = "source-to-mapping" | "lookup-to-mapping" | "mapping-to-table";

function deriveEdgeKind(
  edge: GraphEdge,
  nodesById: Map<string, GraphNode>,
): EdgeKind | null {
  const src = nodesById.get(edge.source);
  const dst = nodesById.get(edge.target);
  if (!src || !dst) return null;
  if (
    src.type === NODE_TYPE.sourceContainer &&
    dst.type === NODE_TYPE.mapping
  ) {
    return "source-to-mapping";
  }
  if (
    src.type === NODE_TYPE.lookupMapping &&
    dst.type === NODE_TYPE.mapping
  ) {
    return "lookup-to-mapping";
  }
  if (
    src.type === NODE_TYPE.mapping &&
    dst.type === NODE_TYPE.analyticTable
  ) {
    return "mapping-to-table";
  }
  return null;
}

/**
 * Apply design-defined styles to each edge based on its inferred kind.
 * Edges that already carry an explicit `style` pass through untouched.
 */
function styleEdges(edges: GraphEdge[], nodes: GraphNode[]): Edge[] {
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  return edges.map((e) => {
    if (e.style) return e;
    const kind = deriveEdgeKind(e, nodesById);
    const marker: EdgeMarkerType = { type: MarkerType.ArrowClosed };
    switch (kind) {
      case "source-to-mapping":
        return {
          ...e,
          type: "smoothstep",
          markerEnd: { ...marker, color: "#6b7280" },
          style: { stroke: "#6b7280", strokeWidth: 1.5 },
        };
      case "lookup-to-mapping":
        return {
          ...e,
          type: "smoothstep",
          animated: true,
          markerEnd: { ...marker, color: "#3b82f6" },
          style: {
            stroke: "#3b82f6",
            strokeWidth: 1.5,
            strokeDasharray: "6 4",
          },
        };
      case "mapping-to-table":
        return {
          ...e,
          type: "smoothstep",
          markerEnd: { ...marker, color: "#16a34a" },
          style: { stroke: "#16a34a", strokeWidth: 1.5 },
        };
      default:
        return e;
    }
  });
}

export const GraphCanvas = forwardRef<GraphCanvasHandle, GraphCanvasProps>(function GraphCanvas(
  { nodes, edges, onNodeClick, onPaneClick, onLayout, onNodeDragStop, onAddNode, onConnect: onConnectProp, onDeleteNode, analyzeDeleteImpact, onDisconnectEdge, onRun },
  ref,
) {
  const [internalNodes, setInternalNodes] = useState<GraphNode[]>(nodes);
  const [internalEdges, setInternalEdges] = useState<Edge[]>(() => styleEdges(edges, nodes));
  const [contextMenu, setContextMenu] = useState<
    | {
        x: number;
        y: number;
        flowX: number;
        flowY: number;
        nodeId?: string;
        edge?: { id: string; source: string; target: string; kind: EdgeKind | null };
      }
    | null
  >(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState<
    { id: string; source: string; target: string } | null
  >(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const screenToFlowRef = useRef<((pos: { x: number; y: number }) => { x: number; y: number }) | null>(null);

  useImperativeHandle(ref, () => ({
    setGraph: (newNodes: GraphNode[], newEdges: GraphEdge[]) => {
      setInternalNodes(newNodes);
      setInternalEdges(styleEdges(newEdges, newNodes));
    },
    updateGraph: (newNodes: GraphNode[], newEdges: GraphEdge[]) => {
      // Merge: keep existing node positions for nodes that already exist,
      // only add/remove as needed
      setInternalNodes((prev) => {
        const prevById = new Map(prev.map((n) => [n.id, n]));
        return newNodes.map((n) => {
          const existing = prevById.get(n.id);
          // Preserve the existing node's measured position if it exists
          return existing ? { ...n, position: existing.position } : n;
        });
      });
      setInternalEdges(styleEdges(newEdges, newNodes));
    },
  }));

  const handleNodesChange = useCallback(
    (changes: NodeChange<GraphNode>[]) => {
      // Block all remove changes, deletion only via right-click menu
      const filtered = changes.filter((c) => c.type !== "remove");
      if (filtered.length > 0) {
        setInternalNodes((prev) => applyNodeChanges(filtered, prev));
      }
    },
    [],
  );

  const handleNodeClick = useCallback<NodeMouseHandler>(
    (_event, node) => {
      onNodeClick?.(node.id);
    },
    [onNodeClick],
  );

  const handlePaneClick = useCallback(
    (_event: ReactMouseEvent) => {
      setContextMenu(null);
      onPaneClick?.();
    },
    [onPaneClick],
  );

  const handleContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault();
      const bounds = wrapperRef.current?.getBoundingClientRect();
      if (!bounds) return;
      setContextMenu({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
        flowX: event.clientX,
        flowY: event.clientY,
      });
    },
    [],
  );

  const handleAutoLayout = useCallback(() => {
    const laid = autoLayout(internalNodes, edges);
    setInternalNodes(laid);
    onLayout?.(laid);
  }, [internalNodes, edges, onLayout]);

  // React Flow's `onNodeDragStop` callback receives the *dragged* nodes
  // as its third argument, not the whole graph (typically a singleton;
  // multi-select drag would have more). Pass the full `internalNodes`
  // instead so the parent can persist every current position. Otherwise
  // a single-node drag would write only that node's position back, and
  // every other auto-laid node would lose its position on reload.
  const handleNodeDragStop = useCallback(() => {
    onNodeDragStop?.(internalNodes);
  }, [internalNodes, onNodeDragStop]);

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        const src = internalNodes.find((n) => n.id === connection.source);
        const dst = internalNodes.find((n) => n.id === connection.target);
        if (!src || !dst) return;
        const srcType = src.type;
        const dstType = dst.type;
        const valid =
          (srcType === NODE_TYPE.sourceContainer && dstType === NODE_TYPE.mapping) ||
          (srcType === NODE_TYPE.mapping && dstType === NODE_TYPE.analyticTable);
        if (!valid) return;
        setInternalEdges((prev) => addEdge(connection, prev));
        onConnectProp?.(connection.source, connection.target);
      }
    },
    [onConnectProp, internalNodes],
  );

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      const src = internalNodes.find((n) => n.id === connection.source);
      const dst = internalNodes.find((n) => n.id === connection.target);
      if (!src || !dst) return false;
      return (
        (src.type === NODE_TYPE.sourceContainer && dst.type === NODE_TYPE.mapping) ||
        (src.type === NODE_TYPE.mapping && dst.type === NODE_TYPE.analyticTable)
      );
    },
    [internalNodes],
  );

  const handleAddNode = useCallback(
    (kind: NodeKind) => {
      const pos = contextMenu
        ? screenToFlowRef.current?.({
            x: contextMenu.flowX,
            y: contextMenu.flowY,
          }) ?? { x: contextMenu.flowX, y: contextMenu.flowY }
        : { x: 0, y: 0 };
      setContextMenu(null);
      onAddNode?.(kind, pos);
    },
    [onAddNode, contextMenu],
  );

  // Drop near the viewport center with jitter so adds don't stack.
  const handleToolbarAdd = useCallback(
    (kind: NodeKind) => {
      const bounds = wrapperRef.current?.getBoundingClientRect();
      const screen = bounds
        ? { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }
        : { x: 0, y: 0 };
      const pos = screenToFlowRef.current?.(screen) ?? { x: 0, y: 0 };
      onAddNode?.(kind, {
        x: pos.x + (Math.random() - 0.5) * 60,
        y: pos.y + (Math.random() - 0.5) * 60,
      });
    },
    [onAddNode],
  );

  const handleNodeContextMenu = useCallback(
    (event: ReactMouseEvent, node: GraphNode) => {
      event.preventDefault();
      const bounds = wrapperRef.current?.getBoundingClientRect();
      if (!bounds) return;
      setContextMenu({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
        flowX: event.clientX,
        flowY: event.clientY,
        nodeId: node.id,
      });
    },
    [],
  );

  const handleDeleteNode = useCallback(() => {
    if (contextMenu?.nodeId) {
      setConfirmDelete(contextMenu.nodeId);
    }
    setContextMenu(null);
  }, [contextMenu]);

  const confirmDeleteNode = useCallback(() => {
    if (confirmDelete) {
      onDeleteNode?.(confirmDelete);
    }
    setConfirmDelete(null);
  }, [confirmDelete, onDeleteNode]);

  const handleEdgeContextMenu = useCallback<EdgeMouseHandler<Edge>>(
    (event, edge) => {
      event.preventDefault();
      const bounds = wrapperRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const nodesById = new Map(internalNodes.map((n) => [n.id, n]));
      const kind = deriveEdgeKind(
        { id: edge.id, source: edge.source, target: edge.target },
        nodesById,
      );
      setContextMenu({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
        flowX: event.clientX,
        flowY: event.clientY,
        edge: { id: edge.id, source: edge.source, target: edge.target, kind },
      });
    },
    [internalNodes],
  );

  const handleDisconnectEdge = useCallback(() => {
    if (contextMenu?.edge && contextMenu.edge.kind !== "lookup-to-mapping") {
      setConfirmDisconnect({
        id: contextMenu.edge.id,
        source: contextMenu.edge.source,
        target: contextMenu.edge.target,
      });
    }
    setContextMenu(null);
  }, [contextMenu]);

  const confirmDisconnectEdge = useCallback(() => {
    if (confirmDisconnect) {
      setInternalEdges((prev) => prev.filter((e) => e.id !== confirmDisconnect.id));
      onDisconnectEdge?.(confirmDisconnect);
    }
    setConfirmDisconnect(null);
  }, [confirmDisconnect, onDisconnectEdge]);

  return (
    <div ref={wrapperRef} className="relative h-full w-full" onContextMenu={(e) => e.preventDefault()}>
      <ReactFlow
        nodes={internalNodes}
        edges={internalEdges}
        nodeTypes={nodeTypes}
        onNodesChange={handleNodesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onNodeDragStop={handleNodeDragStop}
        onConnect={handleConnect}
        isValidConnection={isValidConnection}
        onInit={(instance) => {
          screenToFlowRef.current = instance.screenToFlowPosition;
          instance.fitView();
        }}
        onPaneContextMenu={handleContextMenu}
        onNodeContextMenu={handleNodeContextMenu}
        onEdgeContextMenu={handleEdgeContextMenu}
        nodesDraggable
        panOnScroll
        panOnDrag={[1]}
        proOptions={{ hideAttribution: true }}
        colorMode="dark"
      >
        <Background color="#35363c" />
        <Controls position="bottom-left" />
        <MiniMap position="bottom-right" className="!hidden sm:!block" />
      </ReactFlow>

      {contextMenu && (
        <div
          className="absolute z-20 w-44 rounded-md border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)] py-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.nodeId ? (
            <>
              <div className="px-3 py-1 text-[10px] font-semibold uppercase text-[color:var(--color-ink-3)]">Node</div>
              <button
                type="button"
                onClick={handleDeleteNode}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[color:var(--color-rose-deep)] hover:bg-[color:var(--color-rose-soft)]"
              >
                <IconTrash size={14} /> Delete node
              </button>
            </>
          ) : contextMenu.edge ? (
            <>
              <div className="px-3 py-1 text-[10px] font-semibold uppercase text-[color:var(--color-ink-3)]">Edge</div>
              {contextMenu.edge.kind === "lookup-to-mapping" ? (
                <div
                  className="px-3 py-1.5 text-xs text-[color:var(--color-ink-3)]"
                  title="Lookup edges are derived from the mapping's expressions. Remove the lookup reference in the mapping editor."
                >
                  Edit mapping to remove lookup
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleDisconnectEdge}
                  data-testid="disconnect-edge-button"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[color:var(--color-rose-deep)] hover:bg-[color:var(--color-rose-soft)]"
                >
                  <IconTrash size={14} /> Disconnect edge
                </button>
              )}
            </>
          ) : (
            <>
              <div className="px-3 py-1 text-[10px] font-semibold uppercase text-[color:var(--color-ink-3)]">Add node</div>
              {([
                ["source", "Source", IconSource],
                ["lookup", "Lookup", IconLookup],
                ["mapping", "Mapping", IconMapping],
                ["table", "Table", IconTable],
              ] as [NodeKind, string, React.ComponentType<{ size?: number }>][]).map(([kind, label, Icon]) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => handleAddNode(kind)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)]"
                >
                  <Icon size={14} /> {label}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={handleAutoLayout}
        data-testid="auto-layout-button"
        className="absolute right-3 top-3 z-10 rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-ink-2)] shadow-sm hover:bg-[color:var(--color-surface-2)]"
      >
        Auto layout
      </button>

      {onAddNode && (
        <div
          data-testid="canvas-toolbar"
          className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)] p-1 shadow-[0_6px_24px_rgba(0,0,0,0.4)]"
        >
          {([
            ["source", "Add source", IconSource],
            ["lookup", "Add lookup", IconLookup],
            ["mapping", "Add mapping", IconMapping],
            ["table", "Add table", IconTable],
          ] as [NodeKind, string, React.ComponentType<{ size?: number }>][]).map(
            ([kind, label, Icon]) => (
              <button
                key={kind}
                type="button"
                onClick={() => handleToolbarAdd(kind)}
                title={label}
                aria-label={label}
                data-testid={`canvas-toolbar-${kind}`}
                className="grid h-8 w-8 place-items-center rounded-lg text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-ink)]"
              >
                <Icon size={15} />
              </button>
            ),
          )}
          {onRun && (
            <>
              <span className="mx-0.5 h-4 w-px bg-[color:var(--color-rule-soft)]" aria-hidden />
              <button
                type="button"
                onClick={onRun}
                title="Run pipeline"
                aria-label="Run pipeline"
                data-testid="canvas-toolbar-run"
                className="grid h-8 w-8 place-items-center rounded-lg text-[color:var(--color-leaf)] hover:bg-[color:var(--color-leaf-soft)]"
              >
                <IconPlay size={14} />
              </button>
            </>
          )}
        </div>
      )}

      {confirmDelete && (
        <Modal
          open={true}
          onClose={() => setConfirmDelete(null)}
          position="absolute"
          cardClassName="w-full max-w-md rounded-lg border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)] p-5 shadow-xl"
        >
          <p className="text-sm text-[color:var(--color-ink)]">
            Delete node{" "}
            <code className="rounded bg-[color:var(--color-surface-2)] px-1.5 py-0.5 text-xs">{confirmDelete}</code>?
          </p>
          <p className="mt-1 text-xs text-[color:var(--color-ink-3)]">
            This will remove the node and any connections to it.
          </p>
          {(() => {
            const impact = analyzeDeleteImpact?.(confirmDelete);
            if (!impact) return null;
            const total =
              impact.disconnectedMappings.length +
              impact.disconnectedTables.length +
              impact.brokenExpressions.length;
            if (total === 0) return null;
            return (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <div className="font-semibold">Cascading effects:</div>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {impact.disconnectedMappings.map((m) => (
                    <li key={`m-${m.id}`}>
                      Mapping <span className="font-mono">{m.name}</span> will lose its source connection.
                    </li>
                  ))}
                  {impact.disconnectedTables.map((m) => (
                    <li key={`t-${m.id}`}>
                      Mapping <span className="font-mono">{m.name}</span> will lose its table connection (its columns will be cleared).
                    </li>
                  ))}
                  {impact.brokenExpressions.length > 0 && (
                    <li>
                      <span className="font-semibold">{impact.brokenExpressions.length}</span>{" "}
                      mapping column{impact.brokenExpressions.length === 1 ? "" : "s"} reference this node and will need to be rewritten:
                      <ul className="mt-0.5 list-disc space-y-0.5 pl-4 font-mono text-[11px]">
                        {impact.brokenExpressions.slice(0, 6).map((r) => (
                          <li key={`e-${r.mappingId}-${r.columnName}`}>
                            {r.mappingName} / {r.columnName}
                          </li>
                        ))}
                        {impact.brokenExpressions.length > 6 && (
                          <li className="font-sans italic">
                            … and {impact.brokenExpressions.length - 6} more
                          </li>
                        )}
                      </ul>
                    </li>
                  )}
                </ul>
              </div>
            );
          })()}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmDelete(null)}
              className="rounded border border-[color:var(--color-rule)] px-3 py-1.5 text-xs text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDeleteNode}
              className="rounded bg-[color:var(--color-rose-deep)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[color:var(--color-rose-deep)]"
            >
              Delete
            </button>
          </div>
        </Modal>
      )}

      {confirmDisconnect && (
        <Modal
          open={true}
          onClose={() => setConfirmDisconnect(null)}
          position="absolute"
          cardClassName="rounded-lg border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)] p-5 shadow-xl"
        >
          <p className="text-sm text-[color:var(--color-ink)]">
            Disconnect edge{" "}
            <code className="rounded bg-[color:var(--color-surface-2)] px-1.5 py-0.5 text-xs">{confirmDisconnect.source}</code>
            {" → "}
            <code className="rounded bg-[color:var(--color-surface-2)] px-1.5 py-0.5 text-xs">{confirmDisconnect.target}</code>
            ?
          </p>
          <p className="mt-1 text-xs text-[color:var(--color-ink-3)]">
            The nodes remain. The mapping will no longer reference the connected side.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmDisconnect(null)}
              className="rounded border border-[color:var(--color-rule)] px-3 py-1.5 text-xs text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDisconnectEdge}
              data-testid="confirm-disconnect-edge"
              className="rounded bg-[color:var(--color-rose-deep)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[color:var(--color-rose-deep)]"
            >
              Disconnect
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
});

export default GraphCanvas;
