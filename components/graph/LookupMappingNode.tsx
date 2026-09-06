// Lookup_Mapping node with a preview of the first N keywords.
// Design: right handle only.

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { LookupMappingNodeData } from "@/lib/graph/build";
import NodeShell from "./NodeShell";

const MAX_KEYWORD_PREVIEW = 5;

export function LookupMappingNode({
  data,
  selected,
}: NodeProps & { data: LookupMappingNodeData }) {
  const { entity } = data;
  const keywords: string[] = [];
  for (const row of entity.rows) {
    for (const kw of row.input_patterns) {
      if (keywords.length >= MAX_KEYWORD_PREVIEW) break;
      keywords.push(kw);
    }
    if (keywords.length >= MAX_KEYWORD_PREVIEW) break;
  }
  const moreCount =
    entity.rows.reduce((n, r) => n + r.input_patterns.length, 0) - keywords.length;

  return (
    <NodeShell
      kind="lookup"
      title={entity.name ?? entity.id}
      selected={selected}
      testId="lookup-mapping-node"
      className="min-w-[200px] max-w-[240px]"
      handles={<Handle type="source" position={Position.Right} />}
    >
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
    </NodeShell>
  );
}

export default LookupMappingNode;
