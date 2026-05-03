"use client";

// GraphCanvas — React Flow wrapper for the Data Flow Graph.

import { forwardRef, useCallback, useImperativeHandle, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyNodeChanges,
  useReactFlow,
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
import { toPng } from "html-to-image";
import { NODE_TYPE, type GraphEdge, type GraphNode } from "@/lib/graph/build";
import { autoLayout } from "@/lib/graph/layout";
import type { NodeKind } from "@/lib/graph/nodeDefaults";
import SourceContainerNode from "./SourceContainerNode";
import LookupMappingNode from "./LookupMappingNode";
import MappingNode from "./MappingNode";
import AnalyticTableNode from "./AnalyticTableNode";
import { IconSource, IconLookup, IconMapping, IconTable, IconTrash } from "@/components/icons";
import Modal from "@/components/ui/Modal";

export interface GraphCanvasHandle {
  capturePreview: () => Promise<string | null>;
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
   * Remove an edge from the underlying config. Only fired for edges whose
   * kind maps to a direct config field (source→mapping, mapping→table).
   * Lookup→mapping edges are implicit from the mapping's AST and are not
   * disconnectable from the graph canvas.
   */
  onDisconnectEdge?: (edge: { id: string; source: string; target: string }) => void;
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
  { nodes, edges, onNodeClick, onPaneClick, onLayout, onNodeDragStop, onAddNode, onConnect: onConnectProp, onDeleteNode, onDisconnectEdge },
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
    capturePreview: async () => {
      const el = wrapperRef.current?.querySelector(".react-flow__viewport") as HTMLElement | null;
      if (!el) return null;
      try {
        return await toPng(el, { cacheBust: true, pixelRatio: 0.5, backgroundColor: "#fff8e7" });
      } catch {
        return null;
      }
    },
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
      // Block all remove changes — deletion only via right-click menu
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

  const handleNodeDragStop = useCallback(
    (_event: unknown, _node: unknown, allNodes: GraphNode[]) => {
      onNodeDragStop?.(allNodes);
    },
    [onNodeDragStop],
  );

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
        ? screenToFlowRef.current?.({ x: contextMenu.flowX, y: contextMenu.flowY }) ?? { x: contextMenu.flowX, y: contextMenu.flowY }
        : { x: 0, y: 0 };
      setContextMenu(null);
      onAddNode?.(kind, pos);
    },
    [onAddNode, contextMenu],
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
      >
        <Background />
        <Controls position="bottom-left" />
        <MiniMap position="bottom-right" />
      </ReactFlow>

      {contextMenu && (
        <div
          className="absolute z-20 w-44 rounded-md border border-gray-200 bg-white py-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.nodeId ? (
            <>
              <div className="px-3 py-1 text-[10px] font-semibold uppercase text-gray-400">Node</div>
              <button
                type="button"
                onClick={handleDeleteNode}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
              >
                <IconTrash size={14} /> Delete node
              </button>
            </>
          ) : contextMenu.edge ? (
            <>
              <div className="px-3 py-1 text-[10px] font-semibold uppercase text-gray-400">Edge</div>
              {contextMenu.edge.kind === "lookup-to-mapping" ? (
                <div
                  className="px-3 py-1.5 text-xs text-gray-500"
                  title="Lookup edges are derived from the mapping's expressions. Remove the lookup reference in the mapping editor."
                >
                  Edit mapping to remove lookup
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleDisconnectEdge}
                  data-testid="disconnect-edge-button"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
                >
                  <IconTrash size={14} /> Disconnect edge
                </button>
              )}
            </>
          ) : (
            <>
              <div className="px-3 py-1 text-[10px] font-semibold uppercase text-gray-400">Add node</div>
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
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100"
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
        className="absolute right-3 top-3 z-10 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
      >
        Auto layout
      </button>

      {confirmDelete && (
        <Modal
          open={true}
          onClose={() => setConfirmDelete(null)}
          position="absolute"
          cardClassName="rounded-lg border border-gray-200 bg-white p-5 shadow-xl"
        >
          <p className="text-sm text-gray-800">Delete node <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">{confirmDelete}</code>?</p>
          <p className="mt-1 text-xs text-gray-500">This will remove the node and any connections to it.</p>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmDelete(null)} className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="button" onClick={confirmDeleteNode} className="rounded bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600">Delete</button>
          </div>
        </Modal>
      )}

      {confirmDisconnect && (
        <Modal
          open={true}
          onClose={() => setConfirmDisconnect(null)}
          position="absolute"
          cardClassName="rounded-lg border border-gray-200 bg-white p-5 shadow-xl"
        >
          <p className="text-sm text-gray-800">
            Disconnect edge{" "}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">{confirmDisconnect.source}</code>
            {" → "}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">{confirmDisconnect.target}</code>
            ?
          </p>
          <p className="mt-1 text-xs text-gray-500">
            The nodes remain. The mapping will no longer reference the connected side.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmDisconnect(null)}
              className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDisconnectEdge}
              data-testid="confirm-disconnect-edge"
              className="rounded bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600"
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
