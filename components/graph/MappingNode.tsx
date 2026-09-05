// Mapping node, wider card with a "MAPPING" header and one row per output
// column showing the column name and a compact AST summary.
// Design: left handle (in) and right handle (out).

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { MappingNodeData } from "@/lib/graph/build";
import { astSummary } from "./astSummary";

export function MappingNode({
  data,
  selected,
}: NodeProps & { data: MappingNodeData }) {
  const { entity } = data;
  const ringClass = selected ? "ring-2 ring-[color:var(--color-carrot)]" : "";
  return (
    <div
      data-testid="mapping-node"
      className={`min-w-[280px] max-w-[420px] cursor-pointer rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-surface)] shadow-sm ${ringClass}`}
    >
      <Handle type="target" position={Position.Left} />
      <div className="drag-handle flex cursor-grab items-center justify-between gap-2 rounded-t-md bg-[color:var(--color-surface-2)] px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--color-ink-3)]">
        <span>Mapping</span>
      </div>
      <div className="px-3 py-2">
        <div className="text-sm font-semibold text-[color:var(--color-ink)]">{entity.name || entity.id}</div>
        <ul className="mt-1 space-y-0.5 text-xs text-[color:var(--color-ink-2)]">
          {entity.columns.map((col, i) => (
            // Key by index, not name, newly-added columns share an
            // empty name string and would collide as duplicate keys.
            <li key={i} className="flex gap-2">
              <span className="min-w-[80px] shrink-0 truncate font-medium text-[color:var(--color-ink-2)]">
                {col.name}
              </span>
              <span
                className="min-w-0 truncate font-mono text-[11px] text-[color:var(--color-ink-3)]"
                title={astSummary(col.expr)}
              >
                {astSummary(col.expr)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export default MappingNode;
