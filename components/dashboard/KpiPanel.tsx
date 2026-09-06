"use client";

// Single-stat KPI tile. The query aggregates; this renders the bound
// value from the first result row.

import type { ReactElement } from "react";
import type { PanelV2 } from "@/lib/types/dashboard-v2";
import { formatValue, toNum } from "@/lib/dashboard/format";
import { panelCardClass, type PanelProps } from "./types";

type KpiConfig = Extract<PanelV2, { kind: "kpi" }>;

const ICONS: Record<string, ReactElement> = {
  dollar: (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M8 1.5v13M11.5 4.5c-.7-1-1.9-1.5-3.5-1.5-2 0-3.2 1-3.2 2.4C4.8 8.6 11.3 7.5 11.3 11c0 1.5-1.4 2.5-3.3 2.5-1.7 0-3-.6-3.7-1.7" />
    </svg>
  ),
  chart: (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M2 13.5h12M4 13V8m4 5V4.5m4 8.5V6.5" />
    </svg>
  ),
  shapes: (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="5" cy="5" r="2.5" />
      <rect x="8.5" y="8.5" width="5" height="5" rx="1" />
    </svg>
  ),
  calendar: (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="2" y="3" width="12" height="11" rx="1.5" />
      <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
    </svg>
  ),
};

export function KpiPanel({ config, data }: PanelProps<KpiConfig>) {
  const raw = data.rows[0]?.[config.value];
  let display: string;
  if (raw === undefined || raw === null) {
    display = "-";
  } else if (config.format === "raw") {
    display = String(raw);
  } else {
    const n = toNum(raw);
    if (n === null) display = String(raw);
    else if (config.format === "currency") {
      display = n.toLocaleString(undefined, {
        style: "currency",
        currency: config.currency ?? "USD",
        maximumFractionDigits: 2,
      });
    } else display = formatValue(n);
  }

  const icon = config.icon ? ICONS[config.icon] : null;

  return (
    <div data-testid="kpi-panel" className={`${panelCardClass()} p-3`}>
      <div className="flex items-center gap-2 text-[11px] font-medium text-[color:var(--color-ink-3)]">
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
