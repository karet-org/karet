/**
 * Categorical color palette shared across every dashboard chart panel
 * (doughnut, bar, etc.). Kept in one module so a brand refresh is a
 * single-line change.
 *
 * Colors cycle by index modulo length — there's no hard cap on series
 * count; distinguishability just drops off past ~8.
 */
export const CHART_PALETTE = [
  "#ff6b35",
  "#4caf50",
  "#2196f3",
  "#ffc107",
  "#9c27b0",
  "#00bcd4",
  "#ff5722",
  "#795548",
] as const;

/** Accent used for the "active filter" ring in interactive panels. */
export const CHART_ACCENT = "#ff6b35" as const;
