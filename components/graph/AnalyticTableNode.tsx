// Analytic_Table node, card with a grid icon, "TABLE" header, and the
// output column list. Design: left handle only (terminal node).

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { AnalyticTableNodeData } from "@/lib/graph/build";

export function AnalyticTableNode({
  data,
  selected,
}: NodeProps & { data: AnalyticTableNodeData }) {
  const { entity } = data;
  const ringClass = selected ? "ring-2 ring-orange-500" : "";
  return (
    <div
      data-testid="analytic-table-node"
      className={`min-w-[200px] cursor-pointer rounded-md border border-green-300 bg-white shadow-sm ${ringClass}`}
    >
      <Handle type="target" position={Position.Left} />
      <div className="drag-handle flex cursor-grab items-center gap-1.5 rounded-t-md bg-green-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-green-700">
        <span aria-hidden="true">▤</span>
        <span>Table</span>
      </div>
      <div className="px-3 py-2">
        <div className="text-sm font-semibold text-gray-800">{entity.name}</div>
        <ul className="mt-1 space-y-0.5 text-xs text-gray-600">
          {entity.schema.map((col, i) => (
            // Key by index, not name. Newly-added columns start with an
            // empty name; if we keyed by `col.name`, two empty columns
            // would collide and React's reconciler would mis-match them
            // against the previous render, visibly doubling the row
            // count until the page reloads.
            <li key={i} className="flex justify-between gap-2">
              <span className="truncate">{col.name}</span>
              <span className="text-gray-400">{col.type}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default AnalyticTableNode;
