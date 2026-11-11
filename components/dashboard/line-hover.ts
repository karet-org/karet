// Hover behaviour for line panels: the tooltip follows the pointer's x
// position rather than needing a point under it, lists every series at
// that x, and a vertical guide marks the x being read.

import type { Chart, Plugin, TooltipItem } from "chart.js";
import { formatLabel, formatValue } from "@/lib/dashboard/format";

const GUIDE_COLOR = "rgba(255, 255, 255, 0.35)";

/** Draws a dashed vertical line at the x the tooltip is showing. */
export const hoverGuidePlugin: Plugin<"line"> = {
  id: "karetHoverGuide",
  afterDatasetsDraw(chart: Chart<"line">) {
    const active = chart.tooltip?.getActiveElements() ?? [];
    if (active.length === 0) return;
    const x = active[0].element.x;
    const { top, bottom } = chart.chartArea;
    const ctx = chart.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = GUIDE_COLOR;
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.restore();
  },
};

/** One tooltip line. A single-series chart shows just the value. */
export function tooltipLabel(item: TooltipItem<"line">, seriesCount: number): string {
  // The tooltip filter has already dropped null values.
  const value = formatValue(item.parsed.y ?? 0);
  return seriesCount > 1 ? `${item.dataset.label}: ${value}` : value;
}

/** Interaction and tooltip options for a line panel with `seriesCount` lines. */
export function lineHoverOptions(seriesCount: number) {
  return {
    interaction: { mode: "index" as const, intersect: false },
    tooltip: {
      usePointStyle: true,
      boxPadding: 4,
      // A series with no value at this x is left out rather than shown as NaN.
      filter: (item: TooltipItem<"line">) => item.parsed.y !== null && !Number.isNaN(item.parsed.y),
      callbacks: {
        title: (items: TooltipItem<"line">[]) => (items[0] ? formatLabel(items[0].label) : ""),
        label: (item: TooltipItem<"line">) => tooltipLabel(item, seriesCount),
      },
    },
  };
}
