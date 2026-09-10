// Dimension node with a preview of the first N keywords.
// Design: right handle only.

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { DimensionNodeData } from "@/lib/graph/build";
import NodeShell from "./NodeShell";
import { inlineDimensionRows, isFileRows } from "@/lib/types/config";

const MAX_KEYWORD_PREVIEW = 5;

function DimensionNode({
  data,
  selected,
}: NodeProps & { data: DimensionNodeData }) {
  const { entity } = data;
  // File-backed rows live in the lake, so the node previews the folder
  // instead of patterns it cannot see without a fetch.
  const fileRows = isFileRows(entity.rows);
  const rows = inlineDimensionRows(entity.rows);
  const keywords: string[] = [];
  for (const row of rows) {
    for (const kw of row.patterns) {
      if (keywords.length >= MAX_KEYWORD_PREVIEW) break;
      keywords.push(kw);
    }
    if (keywords.length >= MAX_KEYWORD_PREVIEW) break;
  }
  const moreCount = rows.reduce((n, r) => n + r.patterns.length, 0) - keywords.length;

  return (
    <NodeShell
      kind="dimension"
      title={entity.name ?? entity.id}
      selected={selected}
      testId="dimension-node"
      className="min-w-[200px] max-w-[240px]"
      handles={<Handle type="source" position={Position.Right} />}
    >
      {fileRows && isFileRows(entity.rows) ? (
        <div className="flex flex-col gap-0.5">
          <span className="truncate font-mono text-[10.5px] text-[color:var(--color-ink-2)]">
            {entity.rows.path_prefix}
          </span>
          <span className="text-[10px] text-[color:var(--color-ink-3)]">
            {entity.rows.key} → {entity.rows.values.join(", ")}
          </span>
        </div>
      ) : (
      <ul className="flex flex-wrap gap-1">
        {keywords.map((kw) => (
          <li
            key={kw}
            className="rounded bg-[rgba(108,178,255,0.16)] px-1.5 py-0.5 text-[10px] font-medium text-[#6cb2ff]"
          >
            {kw}
          </li>
        ))}
        {moreCount > 0 && <li className="px-1 py-0.5 text-[10px]">+{moreCount} more</li>}
      </ul>
      )}
    </NodeShell>
  );
}

export default DimensionNode;
