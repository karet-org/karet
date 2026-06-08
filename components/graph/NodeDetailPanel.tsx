// Node Detail Panel: 420px right-hand drawer that mounts the structural
// editor for the selected graph node. Edits flow through the parent via
// `onEdit` which the graph page uses to rebuild the canvas and mark the
// config dirty; persistence is handled by the page's Save & Publish button.

import { useCallback } from "react";
import type { GraphNode } from "@/lib/graph/build";
import { useGraphStore } from "@/lib/graph/store";
import { syncMappingColumnsToSchema } from "@/lib/graph/nodeDefaults";
import type {
  AnalyticTable,
  LookupMapping,
  Mapping,
  SourceContainer,
} from "@/lib/types/config";
import { CloseButton } from "@/components/ui/CloseButton";
import {
  AnalyticTableEditor,
  LookupMappingEditor,
  MappingEditor,
  SourceContainerEditor,
} from "./detail";

export interface NodeDetailPanelProps {
  /** Currently selected node, or null when the panel should close. */
  node: GraphNode | null;
  /** Called when the user clicks the close button. */
  onClose?: () => void;
  /** Called when the user edits an entity. */
  onEdit?: () => void;
}

/** Visual width of the drawer in pixels. Exposed for tests/integrators. */
export const NODE_DETAIL_PANEL_WIDTH_PX = 420;

type EditableEntity = SourceContainer | LookupMapping | Mapping | AnalyticTable;

/**
 * Distinguish AnalyticTable from the other editable shapes by its
 * `schema` field. Source containers also have `schema`, so we additionally
 * check for `output_prefix`, which is unique to analytic tables.
 */
function isAnalyticTable(entity: EditableEntity): entity is AnalyticTable {
  return (
    "schema" in entity &&
    "output_prefix" in entity &&
    typeof (entity as AnalyticTable).output_prefix === "string"
  );
}

export function NodeDetailPanel({ node, onClose, onEdit }: NodeDetailPanelProps) {
  const updateEntity = useCallback((next: EditableEntity) => {
    const cfg = useGraphStore.getState().config;
    if (!cfg) return;

    // Skip when the editor re-emits an unchanged entity (common on
    // input blur after click-with-no-change).
    const existing =
      cfg.source_containers.find((sc) => sc.id === next.id) ??
      cfg.lookup_mappings.find((lm) => lm.id === next.id) ??
      cfg.mappings.find((m) => m.id === next.id) ??
      cfg.analytic_tables.find((t) => t.id === next.id);
    if (existing && JSON.stringify(existing) === JSON.stringify(next)) return;

    // Cross-entity sync: when an analytic_table's schema changes, push
    // the same shape into every Mapping that writes to it. Adds become
    // placeholder mapping columns (`null` expr), renames keep the
    // authored expr, deletes are dropped. Without this, mappings drift
    // from their target table and produce empty output for new columns.
    let mappings = cfg.mappings;
    const previousTable = cfg.analytic_tables.find((t) => t.id === next.id);
    if (previousTable && isAnalyticTable(next)) {
      const previousSchema = previousTable.schema;
      const schemaChanged =
        previousSchema.length !== next.schema.length ||
        previousSchema.some(
          (c, i) =>
            c.name !== next.schema[i]?.name || c.type !== next.schema[i]?.type,
        );
      if (schemaChanged) {
        mappings = mappings.map((m) =>
          m.analytic_table_id === next.id
            ? syncMappingColumnsToSchema(m, previousSchema, next.schema)
            : m,
        );
      }
    }

    const updated = {
      ...cfg,
      source_containers: cfg.source_containers.map((sc) => sc.id === next.id ? next as SourceContainer : sc),
      lookup_mappings: cfg.lookup_mappings.map((lm) => lm.id === next.id ? next as LookupMapping : lm),
      mappings: mappings.map((m) => m.id === next.id ? next as Mapping : m),
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
            <CloseButton
              size="md"
              onClick={onClose}
              label="Close detail panel"
              data-testid="node-detail-panel-close"
            />
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
