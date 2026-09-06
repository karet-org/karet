// Shared types for v2 dashboard panels. Every panel receives its own
// query result and reads bound columns from it; nothing aggregates
// client-side.

import type { PanelV2 } from "@/lib/types/dashboard-v2";

export type Row = Record<string, unknown>;

/** One panel's query result as returned by the /data endpoint. */
export interface PanelData {
  columns: string[];
  rows: Row[];
  truncated: boolean;
}

export interface PanelProps<P extends PanelV2 = PanelV2> {
  config: P;
  data: PanelData;
}

/** Chart-area wrapper derived from `grid.aspect` / `grid.maxHeight`. */
export function chartAreaProps(panel: PanelV2): {
  className: string;
  style: React.CSSProperties;
} {
  const aspect = panel.grid?.aspect ?? "auto";
  const style: React.CSSProperties = {};
  if (panel.grid?.maxHeight) {
    style.maxHeight = panel.grid.maxHeight;
    if (aspect === "square") style.maxWidth = panel.grid.maxHeight;
  }
  if (aspect === "square") {
    return { className: "relative mt-3 mx-auto aspect-square w-full overflow-hidden", style };
  }
  if (aspect === "video") {
    return { className: "relative mt-3 mx-auto aspect-video w-full overflow-hidden", style };
  }
  return { className: "relative mt-3 min-h-[16rem] flex-1 overflow-hidden", style };
}

/** Card shell shared by every panel. */
export function panelCardClass(): string {
  return "flex flex-1 flex-col min-w-0 rounded-[13px] border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)] p-4 shadow-sm";
}
