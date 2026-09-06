// Analytic_Table node. Design: left handle only (terminal node).

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { AnalyticTableNodeData } from "@/lib/graph/build";
import NodeShell from "./NodeShell";

export function AnalyticTableNode({
  data,
  selected,
}: NodeProps & { data: AnalyticTableNodeData }) {
  const { entity } = data;
  return (
    <NodeShell
      kind="table"
      title={entity.name}
      selected={selected}
      testId="analytic-table-node"
      className="min-w-[200px]"
      handles={<Handle type="target" position={Position.Left} />}
    >
      <ul className="space-y-0.5">
        {entity.schema.map((col, i) => (
          // Key by index, not name. Newly-added columns start with an
          // empty name; keying by name would collide and double rows.
          <li key={i} className="flex justify-between gap-2">
            <span className="truncate text-[color:var(--color-ink-2)]">{col.name}</span>
            <span>{col.type}</span>
          </li>
        ))}
      </ul>
    </NodeShell>
  );
}

export default AnalyticTableNode;
