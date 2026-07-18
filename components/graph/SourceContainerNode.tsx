// Source_Container node, rectangular card with a "SOURCE" header and a
// compact column list underneath. Design: right handle only.

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { SourceContainerNodeData } from "@/lib/graph/build";

export function SourceContainerNode({
  data,
  selected,
}: NodeProps & { data: SourceContainerNodeData }) {
  const { entity } = data;
  const ringClass = selected ? "ring-2 ring-orange-500" : "";
  return (
    <div
      data-testid="source-container-node"
      className={`min-w-[200px] cursor-pointer rounded-md border border-gray-300 bg-white shadow-sm ${ringClass}`}
    >
      <div className="drag-handle flex cursor-grab items-center justify-between gap-2 rounded-t-md bg-gray-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        <span>Source</span>
      </div>
      <div className="px-3 py-2">
        <div className="text-sm font-semibold text-gray-800">{entity.name}</div>
        <ul className="mt-1 space-y-0.5 text-xs text-gray-600">
          {entity.schema.map((col, i) => (
            // Key by index, not name, newly-added columns share an
            // empty name string and would collide as duplicate keys.
            <li key={i} className="flex justify-between gap-2">
              <span className="truncate">{col.name}</span>
              <span className="text-gray-400">{col.type}</span>
            </li>
          ))}
        </ul>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export default SourceContainerNode;
