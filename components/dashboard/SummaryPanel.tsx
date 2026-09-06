"use client";

// Summary panel: shows the row count plus a small card per declared column
// with a sensible default aggregate, sum for numeric columns, distinct
// count for non-numeric ones. Matches the design's "Summary" panel kind.

import type { Panel } from "@/lib/types/dashboard";
import { formatValue, toNum } from "@/lib/dashboard/format";
import type { PanelProps } from "./types";

type SummaryPanelConfig = Extract<Panel, { kind: "summary" }>;

/**
 * A column is "numeric" iff the first non-null value in `rows` for that
 * column coerces to a finite number via `toNum`. Rows after the first
 * non-null are not inspected, dashboards are expected to have
 * type-consistent columns because they're backed by typed Parquet schemas.
 */
function isNumericColumn(rows: Record<string, unknown>[], col: string): boolean {
  for (const row of rows) {
    const v = row[col];
    if (v == null) continue;
    // The string "" coerces to 0, which `toNum` would accept. Reject it
    // explicitly so a column of blank strings doesn't register as numeric.
    if (typeof v === "string" && v.trim() === "") return false;
    return toNum(v) !== null;
  }
  return false;
}

export function SummaryPanel({ config, rows }: PanelProps<SummaryPanelConfig>) {
  const stats = config.columns.map((col) => {
    if (isNumericColumn(rows, col)) {
      let sum = 0;
      for (const row of rows) {
        const n = toNum(row[col]);
        if (n !== null) sum += n;
      }
      return { col, label: "Sum", value: formatValue(sum) };
    }
    const distinct = new Set<string>();
    for (const row of rows) {
      const v = row[col];
      if (v != null) distinct.add(String(v));
    }
    return { col, label: "Distinct", value: String(distinct.size) };
  });

  return (
    <div
      data-testid="summary-panel"
      className="flex flex-1 flex-col min-w-0 rounded-[13px] border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)] p-4 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-[color:var(--color-leaf-deep)]">{config.title}</h3>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded bg-[color:var(--color-surface-2)] p-2">
          <div className="text-xs text-[color:var(--color-ink-3)]">Rows</div>
          <div className="text-lg font-semibold">{formatValue(rows.length)}</div>
        </div>
        {stats.map((s) => (
          <div key={s.col} className="rounded bg-[color:var(--color-surface-2)] p-2">
            <div className="text-xs text-[color:var(--color-ink-3)]">
              {s.label} of {s.col}
            </div>
            <div className="text-lg font-semibold">{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SummaryPanel;
