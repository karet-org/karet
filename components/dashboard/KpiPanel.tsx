"use client";

// Single-stat KPI tile: icon + ALL-CAPS label + one big aggregated value.
// Modeled on the headline tiles from the legacy spending-tracker dashboard.

import type { ReactElement } from "react";
import type { Panel, KpiAgg, KpiFormat, KpiIcon, ValueField } from "@/lib/types/dashboard";
import { formatValue } from "@/lib/dashboard/format";
import { resolveValue } from "@/lib/dashboard/evalValue";
import { aggregateValues } from "./aggregate";
import type { PanelProps } from "./types";

type KpiPanelConfig = Extract<Panel, { kind: "kpi" }>;

function formatNumber(
  n: number,
  format: KpiFormat | undefined,
  currency: string | undefined,
): string {
  if (format === "currency") {
    return n.toLocaleString(undefined, {
      style: "currency",
      currency: currency ?? "USD",
      maximumFractionDigits: 2,
    });
  }
  return formatValue(n);
}

function computeMode(rows: Record<string, unknown>[], column: string): { key: string; rows: Record<string, unknown>[] } | null {
  const buckets = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const v = row[column];
    if (v == null || v === "") continue;
    const k = String(v);
    const bucket = buckets.get(k);
    if (bucket) bucket.push(row);
    else buckets.set(k, [row]);
  }
  let best: { key: string; rows: Record<string, unknown>[] } | null = null;
  for (const [key, group] of buckets) {
    if (!best || group.length > best.rows.length) best = { key, rows: group };
  }
  return best;
}

function computeNumeric(
  rows: Record<string, unknown>[],
  field: ValueField,
  agg: Exclude<KpiAgg, "mode">,
): number {
  if (agg === "count") return rows.length;
  const nums: number[] = [];
  for (const row of rows) {
    const n = resolveValue(row, field);
    if (n !== null) nums.push(n);
  }
  return aggregateValues(nums, agg);
}

const ICONS: Record<KpiIcon, ReactElement> = {
  dollar: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm.75 4v.6c1.1.18 1.9.78 2.05 1.95l-1.45.18c-.07-.55-.4-.85-.95-.93v1.7c1.55.34 2.4 1 2.4 2.27 0 1.32-.93 2.07-2.4 2.27v.7h-1v-.7c-1.18-.16-2.07-.78-2.25-2.07l1.5-.18c.1.6.45.93 1 1.04v-1.83c-1.45-.32-2.3-.95-2.3-2.18 0-1.27.9-1.97 2.3-2.15V6h.6zm-.6 3.3V7.97c-.5.1-.78.4-.78.78 0 .35.25.55.78.75v-.2zm.6 2.13v1.42c.55-.1.85-.4.85-.8 0-.4-.28-.6-.85-.7z" />
    </svg>
  ),
  chart: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path d="M3 3v14h14v-2H5V3H3zm4 8h2v4H7v-4zm4-3h2v7h-2V8zm4-3h2v10h-2V5z" />
    </svg>
  ),
  shapes: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
      <circle cx="5.5" cy="5.5" r="2.5" />
      <rect x="11" y="3" width="6" height="6" rx="1" />
      <path d="M5 12.5 L9 18 L1 18 Z" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path d="M5 2v2H3v14h14V4h-2V2h-2v2H7V2H5zm10 6v8H5V8h10z" />
    </svg>
  ),
};

export function KpiPanel({ config, rows }: PanelProps<KpiPanelConfig>) {
  let display: string;
  if (config.agg === "mode") {
    // `mode` is a categorical aggregation: the grouping key must be a plain
    // column, not an arithmetic expression.
    const column = typeof config.column === "string" ? config.column : null;
    const mode = column ? computeMode(rows, column) : null;
    if (!mode) {
      display = "--";
    } else if (config.value_column) {
      const sum = computeNumeric(mode.rows, config.value_column, "sum");
      display = `${mode.key} (${formatNumber(sum, config.format ?? "currency", config.currency)})`;
    } else {
      display = mode.key;
    }
  } else {
    const n = computeNumeric(rows, config.column, config.agg);
    display = formatNumber(n, config.format, config.currency);
  }

  const icon = config.icon ? ICONS[config.icon] : null;

  return (
    <div
      data-testid="kpi-panel"
      className="flex flex-1 flex-col min-w-0 rounded-[13px] border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)] p-3 shadow-sm"
    >
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--color-ink-3)]">
        {icon && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--color-leaf-soft)] text-[color:var(--color-leaf-deep)]">
            {icon}
          </span>
        )}
        <span>{config.title}</span>
      </div>
      <div className="mt-1.5 text-lg font-semibold text-[color:var(--color-leaf-deep)]">{display}</div>
    </div>
  );
}

export default KpiPanel;
