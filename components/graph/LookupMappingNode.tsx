// Lookup_Mapping node, rounded card with a small table icon, "LOOKUP"
// header, and a preview of the first N keywords. Design: right handle only.

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { LookupMappingNodeData } from "@/lib/graph/build";

const MAX_KEYWORD_PREVIEW = 5;

export function LookupMappingNode({
  data,
  selected,
}: NodeProps & { data: LookupMappingNodeData }) {
  const { entity } = data;
  const ringClass = selected ? "ring-2 ring-orange-500" : "";
  const keywords: string[] = [];
  for (const row of entity.rows) {
    for (const kw of row.input_patterns) {
      if (keywords.length >= MAX_KEYWORD_PREVIEW) break;
      keywords.push(kw);
    }
    if (keywords.length >= MAX_KEYWORD_PREVIEW) break;
  }
  const moreCount = entity.rows.reduce((n, r) => n + r.input_patterns.length, 0) - keywords.length;

  return (
    <div
      data-testid="lookup-mapping-node"
      className={`min-w-[200px] max-w-[240px] cursor-pointer rounded-xl border border-blue-300 bg-white shadow-sm ${ringClass}`}
    >
      <div className="drag-handle flex cursor-grab items-center gap-1.5 rounded-t-xl bg-blue-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-blue-600">
        <span aria-hidden="true">▦</span>
        <span>Lookup</span>
      </div>
      <div className="px-3 py-2">
        <div className="text-sm font-semibold text-gray-800">
          {entity.name ?? entity.id}
        </div>
        <ul className="mt-1 flex flex-wrap gap-1 text-xs">
          {keywords.map((kw, i) => (
            <li
              key={i}
              className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700"
            >
              {kw}
            </li>
          ))}
          {moreCount > 0 ? (
            <li className="text-gray-400">+{moreCount} more</li>
          ) : null}
        </ul>
      </div>
      {/* Hidden handle for auto-drawn lookup-ref edges - not interactive */}
      <Handle type="source" position={Position.Right} style={{ opacity: 0, pointerEvents: "none" }} />
    </div>
  );
}

export default LookupMappingNode;
