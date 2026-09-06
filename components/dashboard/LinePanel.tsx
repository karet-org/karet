"use client";

// Line panel: x/y bound columns, optional series pivot.

import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";
import type { PanelV2 } from "@/lib/types/dashboard-v2";
import { CHART_PALETTE } from "@/lib/dashboard/palette";
import { pivotSeries } from "./series";
import { chartAreaProps, panelCardClass, type PanelProps } from "./types";

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Title, Tooltip, Legend);

type LineConfig = Extract<PanelV2, { kind: "line" }>;

export function LinePanel({ config, data }: PanelProps<LineConfig>) {
  const { labels, datasets } = pivotSeries(data.rows, config.x, config.y, config.series);

  const chartData = {
    labels,
    datasets: datasets.map((d, i) => ({
      label: d.name ?? config.title,
      data: d.values,
      borderColor: CHART_PALETTE[i % CHART_PALETTE.length],
      backgroundColor: CHART_PALETTE[i % CHART_PALETTE.length],
      pointRadius: labels.length > 60 ? 0 : 2,
      tension: 0.25,
      spanGaps: true,
    })),
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: datasets.length > 1 } },
    scales: { x: { grid: { display: false } }, y: { beginAtZero: false } },
  };

  return (
    <div data-testid="line-panel" className={panelCardClass()}>
      <h3 className="text-sm font-semibold text-[color:var(--color-leaf-deep)]">{config.title}</h3>
      <div {...chartAreaProps(config)}>
        {labels.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-[color:var(--color-ink-3)]">
            No data
          </div>
        ) : (
          <Line data={chartData} options={options} />
        )}
      </div>
    </div>
  );
}

export default LinePanel;
