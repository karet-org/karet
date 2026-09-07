// Edits go to the store and signal `onEdit`; the graph page persists them.

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
import CloseButton from "@/components/ui/CloseButton";
import AnalyticTableEditor from "./detail/AnalyticTableEditor";
import LookupMappingEditor from "./detail/LookupMappingEditor";
import MappingEditor from "./detail/MappingEditor";
import SourceContainerEditor from "./detail/SourceContainerEditor";

interface NodeDetailPanelProps {
  /** Selected node; null closes the panel. */
  node: GraphNode | null;
  onClose?: () => void;
  onEdit?: () => void;
}

type EditableEntity = SourceContainer | LookupMapping | Mapping | AnalyticTable;

/** An AnalyticTable has a `schema` but, unlike a source container, no `path_prefix`. */
function isAnalyticTable(entity: EditableEntity): entity is AnalyticTable {
  return "schema" in entity && !("path_prefix" in entity);
}

function NodeDetailPanel({ node, onClose, onEdit }: NodeDetailPanelProps) {
  const updateEntity = useCallback((next: EditableEntity) => {
    const cfg = useGraphStore.getState().config;
    if (!cfg) return;

    // Editors re-emit unchanged entities on blur; skip those.
    const existing =
      cfg.source_containers.find((sc) => sc.id === next.id) ??
      cfg.lookup_mappings.find((lm) => lm.id === next.id) ??
      cfg.mappings.find((m) => m.id === next.id) ??
      cfg.analytic_tables.find((t) => t.id === next.id);
    if (existing && JSON.stringify(existing) === JSON.stringify(next)) return;

    // Push analytic_table schema changes into every Mapping that writes to
    // it, otherwise mappings drift and emit empty output for new columns.
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

  // sm:w-[300px] must match the graph page canvas offset (sm:w-[calc(100%-300px)]).
  return (
    <aside
      data-testid="node-detail-panel"
      aria-label="Node detail panel"
      className="fixed right-0 top-0 z-20 flex h-screen w-full flex-col border-l border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)] sm:w-[300px]"
    >
      <header className="flex items-center justify-between gap-2 border-b border-[color:var(--color-rule-soft)] px-4 pb-2.5 pt-3">
        <div className="min-w-0">
          <div className="text-[11px] tracking-[0.3px] text-[color:var(--color-ink-3)]">
            {headerLabel(node)}
          </div>
          <h2
            className="mt-px truncate text-[13px] font-semibold text-[color:var(--color-ink)]"
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
      <div className="flex-1 overflow-y-auto px-4 py-3.5">
        <EditorBody node={node} onChange={updateEntity} />
      </div>
    </aside>
  );
}

function headerLabel(node: GraphNode): string {
  switch (node.data.kind) {
    case "source-container":
      return "Source container";
    case "lookup-mapping":
      return "Lookup";
    case "mapping":
      return "Mapping";
    case "analytic-table":
      return "Analytic table";
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
