// Source_Container node. Design: right handle only.

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { SourceContainerNodeData } from "@/lib/graph/build";
import NodeShell from "./NodeShell";

export function SourceContainerNode({
  data,
  selected,
}: NodeProps & { data: SourceContainerNodeData }) {
  const { entity } = data;
  return (
    <NodeShell
      kind="source"
      title={entity.name}
      selected={selected}
      testId="source-container-node"
      className="min-w-[200px]"
      handles={<Handle type="source" position={Position.Right} />}
    >
      <ul className="space-y-0.5">
        {entity.schema.map((col, i) => (
          // Key by index, not name, newly-added columns share an
          // empty name string and would collide as duplicate keys.
          <li key={i} className="flex justify-between gap-2">
            <span className="truncate text-[color:var(--color-ink-2)]">{col.name}</span>
            <span>{col.type}</span>
          </li>
        ))}
      </ul>
    </NodeShell>
  );
}

export default SourceContainerNode;
