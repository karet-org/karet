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
  const ringClass = selected ? "ring-2 ring-orange-500" : "";
  return (
    <div
      data-testid="mapping-node"
      className={`min-w-[280px] max-w-[420px] cursor-pointer rounded-md border border-gray-300 bg-white shadow-sm ${ringClass}`}
    >
      <Handle type="target" position={Position.Left} />
      <div className="drag-handle flex cursor-grab items-center justify-between gap-2 rounded-t-md bg-gray-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        <span>Mapping</span>
      </div>
      <div className="px-3 py-2">
        <div className="text-sm font-semibold text-gray-800">{entity.name || entity.id}</div>
        <ul className="mt-1 space-y-0.5 text-xs text-gray-600">
          {entity.columns.map((col, i) => (
            // Key by index, not name, newly-added columns share an
            // empty name string and would collide as duplicate keys.
            <li key={i} className="flex gap-2">
              <span className="min-w-[80px] shrink-0 truncate font-medium text-gray-700">
                {col.name}
              </span>
              <span
                className="min-w-0 truncate font-mono text-[11px] text-gray-500"
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
