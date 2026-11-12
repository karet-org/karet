/** Categorical palette for chart panels; colors cycle by index modulo length. */
export const CHART_PALETTE = [
  "#ff6b35", // carrot orange
  "#22c55e", // leafy green
  "#fb923c", // soft orange
  "#16a34a", // deep green
  "#fdba74", // pale orange
  "#86efac", // pale green
  "#dc2626", // tomato red (rare accent)
  "#15803d", // forest green
] as const;

/** Accent used for the "active filter" ring in interactive panels. */
export const CHART_ACCENT = "#ff6b35" as const;

/**
 * One color per dataset, for every bar in it. With an active filter value,
 * the other bars are dimmed. A color per bar would carry no meaning, and the
 * palette's red would read as an error.
 */
export function barColors(labels: string[], datasetIndex: number, active: string | null): string[] {
  const base = CHART_PALETTE[datasetIndex % CHART_PALETTE.length];
  return labels.map((label) => (active !== null && label !== active ? base + "40" : base));
}

// Imported for the side effect below: Chart.js dark-theme globals.
import { defaults } from "chart.js";

defaults.color = "#8f9098";
defaults.borderColor = "rgba(255, 255, 255, 0.08)";

/** Surface color used for chart segment separators on dark panels. */
export const CHART_SURFACE = "#202127" as const;
