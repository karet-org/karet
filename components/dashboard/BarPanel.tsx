"use client";

// Bar panel: x/y bound columns, optional series pivot, optional
// horizontal orientation.

import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Title,
  Tooltip,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import type { PanelV2 } from "@/lib/types/dashboard-v2";
import { CHART_ACCENT, CHART_PALETTE } from "@/lib/dashboard/palette";
import type { Params } from "@/lib/services/dashboard-data";
import { toNum } from "@/lib/dashboard/format";
import { pivotSeries } from "./series";
import { chartAreaProps, panelCardClass, type PanelProps } from "./types";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

type BarConfig = Extract<PanelV2, { kind: "bar" }>;

export function BarPanel({
  config,
  data,
  params,
  onEmit,
}: PanelProps<BarConfig> & { params?: Params; onEmit?: (param: string, value: string) => void }) {
  const { labels, datasets } = pivotSeries(data.rows, config.x, config.y, config.series);
  const emit = config.emit;
  const active = emit ? (params?.[emit.param] ?? null) : null;

  const chartData = {
    labels,
    datasets: datasets.map((d, i) => ({
      label: d.name ?? config.title,
      data: d.values,
      backgroundColor:
        datasets.length > 1
          ? CHART_PALETTE[i % CHART_PALETTE.length]
          : labels.map((label, j) => {
              const base = CHART_PALETTE[j % CHART_PALETTE.length];
              return active !== null && label !== active ? base + "40" : base;
            }),
      borderColor: labels.map((label) =>
        active !== null && label === active ? CHART_ACCENT : "transparent",
      ),
      borderWidth: 2,
    })),
  };

  const options = {
    indexAxis: config.horizontal ? ("y" as const) : ("x" as const),
    responsive: true,
    maintainAspectRatio: false,
    onClick: (_e: unknown, elements: { index: number }[]) => {
      if (!emit || !onEmit || elements.length === 0) return;
      const label = labels[elements[0].index];
      if (label) onEmit(emit.param, label);
    },
    onHover: (event: { native: Event | null }, elements: unknown[]) => {
      const target = event.native?.target as HTMLElement | null;
      if (target && emit) target.style.cursor = elements.length > 0 ? "pointer" : "default";
    },
    plugins: { legend: { display: datasets.length > 1 } },
    scales: config.horizontal
      ? { x: { beginAtZero: true }, y: { grid: { display: false } } }
      : { x: { grid: { display: false } }, y: { beginAtZero: true } },
  };

  return (
    <div data-testid="bar-panel" className={panelCardClass()}>
      <h3 className="text-sm font-semibold text-[color:var(--color-leaf-deep)]">{config.title}</h3>
      <div {...chartAreaProps(config)}>
        {labels.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-[color:var(--color-ink-3)]">
            No data
          </div>
        ) : (
          <Bar data={chartData} options={options} />
        )}
      </div>
    </div>
  );
}

export default BarPanel;
export { toNum };
