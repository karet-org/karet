// Node Detail Panel — 420px right-hand drawer that mounts the structural
// editor for the selected graph node. Edits flow through the parent via
// `onEdit` which the graph page uses to rebuild the canvas and mark the
// config dirty; persistence is handled by the page's Save & Publish button.

import { useCallback } from "react";
import type { GraphNode } from "@/lib/graph/build";
import { useGraphStore } from "@/lib/graph/store";
import type {
  AnalyticTable,
  LookupMapping,
  Mapping,
  SourceContainer,
} from "@/lib/types/config";
import {
  AnalyticTableEditor,
  LookupMappingEditor,
  MappingEditor,
  SourceContainerEditor,
} from "./detail";

export interface NodeDetailPanelProps {
  /** Currently selected node, or null when the panel should close. */
  node: GraphNode | null;
  /** Called when the user clicks the close (×) button. */
  onClose?: () => void;
  /** Called when the user edits an entity. */
  onEdit?: () => void;
}

/** Visual width of the drawer in pixels. Exposed for tests/integrators. */
export const NODE_DETAIL_PANEL_WIDTH_PX = 420;

type EditableEntity = SourceContainer | LookupMapping | Mapping | AnalyticTable;

export function NodeDetailPanel({ node, onClose, onEdit }: NodeDetailPanelProps) {
  const updateEntity = useCallback((next: EditableEntity) => {
    const cfg = useGraphStore.getState().config;
    if (!cfg) return;
    const updated = {
      ...cfg,
      source_containers: cfg.source_containers.map((sc) => sc.id === next.id ? next as SourceContainer : sc),
      lookup_mappings: cfg.lookup_mappings.map((lm) => lm.id === next.id ? next as LookupMapping : lm),
      mappings: cfg.mappings.map((m) => m.id === next.id ? next as Mapping : m),
      analytic_tables: cfg.analytic_tables.map((t) => t.id === next.id ? next as AnalyticTable : t),
    };
    useGraphStore.setState({ config: updated });
    onEdit?.();
  }, [onEdit]);

  if (!node) return null;

  return (
    <aside
      data-testid="node-detail-panel"
      aria-label="Node detail panel"
      className="fixed right-0 top-0 z-20 flex h-screen flex-col border-l border-gray-200 bg-white shadow-lg"
      style={{ width: `${NODE_DETAIL_PANEL_WIDTH_PX}px` }}
    >
      <header className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            {headerLabel(node)}
          </div>
          <h2
            className="truncate text-sm font-semibold text-gray-800"
            title={node.id}
          >
            {node.data.entity.name || node.id}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close detail panel"
              data-testid="node-detail-panel-close"
              className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
            >
              ×
            </button>
          ) : null}
        </div>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <EditorBody node={node} onChange={updateEntity} />
      </div>
    </aside>
  );
}

function headerLabel(node: GraphNode): string {
  switch (node.data.kind) {
    case "source-container":
      return "Source Container";
    case "lookup-mapping":
      return "Lookup Mapping";
    case "mapping":
      return "Mapping";
    case "analytic-table":
      return "Analytic Table";
  }
}

function EditorBody({
  node,
  onChange,
}: {
  node: GraphNode;
  onChange: (next: EditableEntity) => void;
}) {
  const entity = node.data.entity;
  switch (node.data.kind) {
    case "source-container":
      return <SourceContainerEditor value={entity as SourceContainer} onChange={onChange} />;
    case "lookup-mapping":
      return <LookupMappingEditor value={entity as LookupMapping} onChange={onChange} />;
    case "mapping":
      return <MappingEditor value={entity as Mapping} onChange={onChange} />;
    case "analytic-table":
      return <AnalyticTableEditor value={entity as AnalyticTable} onChange={onChange} />;
  }
}

export default NodeDetailPanel;
