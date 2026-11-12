import type { Chart, TooltipItem } from "chart.js";
import { describe, expect, it, vi } from "vitest";
import { hoverGuidePlugin, lineHoverOptions, tooltipLabel } from "../line-hover";

function item(y: number | null, label = "visa"): TooltipItem<"line"> {
  return { parsed: { x: 0, y }, dataset: { label } } as unknown as TooltipItem<"line">;
}

const drawGuide = hoverGuidePlugin.afterDatasetsDraw as unknown as (chart: Chart<"line">) => void;

function fakeChart(activeX: number[]) {
  const ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    setLineDash: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    lineWidth: 0,
    strokeStyle: "",
  };
  const chart = {
    ctx,
    chartArea: { top: 10, bottom: 200, left: 0, right: 400 },
    tooltip: { getActiveElements: () => activeX.map((x) => ({ element: { x } })) },
  } as unknown as Chart<"line">;
  return { chart, ctx };
}

describe("line panel hover", () => {
  it("shows the tooltip for the hovered x, not only when a point is under the pointer", () => {
    expect(lineHoverOptions([], 2).interaction).toEqual({ mode: "index", intersect: false });
  });

  it("labels each series when there are several, and shows only the value for one", () => {
    expect(tooltipLabel(item(1234.5), 2)).toBe("visa: 1,234.5");
    expect(tooltipLabel(item(1234.5), 1)).toBe("1,234.5");
  });

  it("titles the tooltip with the x label, not the raw number a time axis gives", () => {
    const { title } = lineHoverOptions(["2026-09-10T00:00:00.000Z", "2026-10-29T00:00:00.000Z"], 1).tooltip.callbacks;
    const hovered = { dataIndex: 1, label: "1,793,232,000,000" } as unknown as TooltipItem<"line">;
    expect(title([hovered])).toBe("2026-10-29");
  });

  it("leaves out series with no value at the hovered x", () => {
    const { filter } = lineHoverOptions([], 2).tooltip;
    expect(filter(item(3))).toBe(true);
    expect(filter(item(null))).toBe(false);
  });

  it("draws the guide at the active x across the chart area", () => {
    const { chart, ctx } = fakeChart([120, 120]);
    drawGuide(chart);
    expect(ctx.moveTo).toHaveBeenCalledWith(120, 10);
    expect(ctx.lineTo).toHaveBeenCalledWith(120, 200);
    expect(ctx.stroke).toHaveBeenCalledOnce();
  });

  it("draws nothing when the pointer is not over the chart", () => {
    const { chart, ctx } = fakeChart([]);
    drawGuide(chart);
    expect(ctx.stroke).not.toHaveBeenCalled();
  });
});
