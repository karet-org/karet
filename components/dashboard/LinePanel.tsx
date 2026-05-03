"use client";

// Line panel: bins rows by `x` (optionally via `x_bin`), aggregates `y`
// with `agg`, renders a Chart.js Line.

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
import type { Panel } from "@/lib/types/dashboard";
import { toNum } from "@/lib/dashboard/format";
import { aggregateValues, binDate } from "./aggregate";
import type { PanelProps } from "./types";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
);

type LinePanelConfig = Extract<Panel, { kind: "line" }>;

export function LinePanel({ config, rows }: PanelProps<LinePanelConfig>) {
  const buckets = new Map<string, number[]>();
  for (const row of rows) {
    const key = binDate(row[config.x], config.x_bin);
    const y = toNum(row[config.y]) ?? 0;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(y);
    else buckets.set(key, [y]);
  }
  const labels = Array.from(buckets.keys()).sort();
  const values = labels.map((k) =>
    aggregateValues(buckets.get(k) ?? [], config.agg),
  );

  const data = {
    labels,
    datasets: [
      {
        label: config.title,
        data: values,
        borderColor: "#ff6b35",
        backgroundColor: "rgba(255, 107, 53, 0.2)",
        tension: 0.3,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      x: { grid: { display: false } },
      y: { beginAtZero: true },
    },
  };

  return (
    <div
      data-testid="line-panel"
      className="rounded-md border border-gray-200 bg-white p-4"
    >
      <h3 className="text-sm font-semibold text-gray-800">{config.title}</h3>
      <div className="relative mt-3 h-64">
        {labels.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            No data
          </div>
        ) : (
          <Line data={data} options={options} />
        )}
      </div>
    </div>
  );
}

export default LinePanel;
