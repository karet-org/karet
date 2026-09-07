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

// Imported for the side effect below: Chart.js dark-theme globals.
import { defaults } from "chart.js";

defaults.color = "#8f9098";
defaults.borderColor = "rgba(255, 255, 255, 0.08)";

/** Surface color used for chart segment separators on dark panels. */
export const CHART_SURFACE = "#202127" as const;
