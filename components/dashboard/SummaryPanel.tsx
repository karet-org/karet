"use client";

// Summary panel: row and column counts of its query result.

import type { PanelV2 } from "@/lib/types/dashboard-v2";
import { panelCardClass, type PanelProps } from "./types";

type SummaryConfig = Extract<PanelV2, { kind: "summary" }>;

export function SummaryPanel({ config, data }: PanelProps<SummaryConfig>) {
  return (
    <div data-testid="summary-panel" className={panelCardClass()}>
      <h3 className="text-sm font-semibold text-[color:var(--color-leaf-deep)]">{config.title}</h3>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded bg-[color:var(--color-surface-2)] p-2">
          <div className="text-xs text-[color:var(--color-ink-3)]">Rows</div>
          <div className="font-semibold text-[color:var(--color-ink)]">
            {data.rows.length.toLocaleString()}
            {data.truncated ? "+" : ""}
          </div>
        </div>
        <div className="rounded bg-[color:var(--color-surface-2)] p-2">
          <div className="text-xs text-[color:var(--color-ink-3)]">Columns</div>
          <div className="font-semibold text-[color:var(--color-ink)]">{data.columns.length}</div>
        </div>
      </div>
    </div>
  );
}

export default SummaryPanel;
