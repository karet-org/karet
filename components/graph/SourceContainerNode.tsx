// Source_Container node, rectangular card with a "SOURCE" header and a
// compact column list underneath. Design: right handle only.

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { SourceContainerNodeData } from "@/lib/graph/build";

export function SourceContainerNode({
  data,
  selected,
}: NodeProps & { data: SourceContainerNodeData }) {
  const { entity } = data;
  const ringClass = selected ? "ring-2 ring-[color:var(--color-carrot)]" : "";
  return (
    <div
      data-testid="source-container-node"
      className={`min-w-[200px] cursor-pointer rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-surface)] shadow-sm ${ringClass}`}
    >
      <div className="drag-handle flex cursor-grab items-center justify-between gap-2 rounded-t-md bg-[color:var(--color-surface-2)] px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--color-ink-3)]">
        <span>Source</span>
      </div>
      <div className="px-3 py-2">
        <div className="text-sm font-semibold text-[color:var(--color-ink)]">{entity.name}</div>
        <ul className="mt-1 space-y-0.5 text-xs text-[color:var(--color-ink-2)]">
          {entity.schema.map((col, i) => (
            // Key by index, not name, newly-added columns share an
            // empty name string and would collide as duplicate keys.
            <li key={i} className="flex justify-between gap-2">
              <span className="truncate">{col.name}</span>
              <span className="text-[color:var(--color-ink-3)]">{col.type}</span>
            </li>
          ))}
        </ul>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export default SourceContainerNode;
