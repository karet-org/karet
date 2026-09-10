// Rollup node: the grain on top, the aggregates it produces below.
// Design: handles on both sides — a table in, a table out.

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { RollupNodeData } from "@/lib/graph/build";
import { aggregateOutputs, isGrainLocked } from "@/lib/types/config";
import NodeShell from "./NodeShell";

const MAX_AGGREGATE_PREVIEW = 6;

function RollupNode({ data, selected }: NodeProps & { data: RollupNodeData }) {
  const { entity } = data;
  const shown = entity.aggregates.slice(0, MAX_AGGREGATE_PREVIEW);
  const moreCount = entity.aggregates.length - shown.length;

  return (
    <NodeShell
      kind="rollup"
      title={entity.name ?? entity.id}
      selected={selected}
      testId="rollup-node"
      className="min-w-[220px] max-w-[340px]"
      handles={
        <>
          <Handle type="target" position={Position.Left} />
          <Handle type="source" position={Position.Right} />
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] uppercase tracking-wide text-[color:var(--color-ink-3)]">
            by
          </span>
          {entity.group_by.length === 0 ? (
            <span className="text-[11px] text-[color:var(--color-ink-3)]">(no grain)</span>
          ) : (
            entity.group_by.map((g) => (
              <span
                key={g}
                className="rounded bg-white/[0.06] px-1.5 py-[1px] font-mono text-[10.5px] text-[color:var(--color-ink-2)]"
              >
                {g}
              </span>
            ))
          )}
        </div>
        <div className="flex flex-col gap-[2px]">
          {shown.map((agg) => (
            <div key={agg.name} className="flex items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-[color:var(--color-ink-2)]">
                {aggregateOutputs(agg).join(", ")}
              </span>
              <span className="flex-none text-[10px] text-[color:var(--color-ink-3)]">
                {agg.fn}
                {isGrainLocked(agg) ? " ·locked" : ""}
              </span>
            </div>
          ))}
          {moreCount > 0 ? (
            <span className="text-[10px] text-[color:var(--color-ink-3)]">+{moreCount} more</span>
          ) : null}
        </div>
      </div>
    </NodeShell>
  );
}

export default RollupNode;
