// Mapping node: one row per output column with a compact AST summary.
// Design: left handle (in) and right handle (out).

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { MappingNodeData } from "@/lib/graph/build";
import { astSummary } from "./astSummary";
import NodeShell from "./NodeShell";

export function MappingNode({
  data,
  selected,
}: NodeProps & { data: MappingNodeData }) {
  const { entity } = data;
  return (
    <NodeShell
      kind="mapping"
      title={entity.name || entity.id}
      selected={selected}
      testId="mapping-node"
      className="min-w-[280px] max-w-[420px]"
      handles={
        <>
          <Handle type="target" position={Position.Left} />
          <Handle type="source" position={Position.Right} />
        </>
      }
    >
      <ul className="space-y-0.5">
        {entity.columns.map((col, i) => (
          // Key by index, not name, newly-added columns share an
          // empty name string and would collide as duplicate keys.
          <li key={i} className="flex gap-2">
            <span className="min-w-[80px] shrink-0 truncate font-medium text-[color:var(--color-ink-2)]">
              {col.name}
            </span>
            <span
              className="min-w-0 truncate font-mono text-[11px]"
              title={astSummary(col.expr)}
            >
              {astSummary(col.expr)}
            </span>
          </li>
        ))}
      </ul>
    </NodeShell>
  );
}

export default MappingNode;
