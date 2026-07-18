/**
 * Categorical color palette shared across every dashboard chart panel
 * (doughnut, bar, etc.). Kept in one module so a brand refresh is a
 * single-line change.
 *
 * Colors cycle by index modulo length, there's no hard cap on series
 * count; distinguishability just drops off past ~8.
 */
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
