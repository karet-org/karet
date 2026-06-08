"use client";

// Line panel: bins rows by `x` (optionally via `x_bin`), aggregates `y`,
// renders a Chart.js Line. Read-only.

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
import { applyWhere } from "@/lib/dashboard/evalWhere";
import { resolveValue } from "@/lib/dashboard/evalValue";
import { aggregateValues, binDate, previousPeriodLabel, runningTotal } from "./aggregate";
import { chartAreaProps, type PanelProps } from "./types";

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
  const scopedRows = applyWhere(rows, config.where);
  const buckets = new Map<string, number[]>();
  for (const row of scopedRows) {
    const key = binDate(row[config.x], config.x_bin);
    const y = resolveValue(row, config.y) ?? 0;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(y);
    else buckets.set(key, [y]);
  }
  const sortedLabels = Array.from(buckets.keys()).sort();
  const aggregated = sortedLabels.map((k) =>
    aggregateValues(buckets.get(k) ?? [], config.agg),
  );

  let labels = sortedLabels;
  let values: number[];
  if (config.cumulative) {
    // Anchor at 0 on the period before the first bucket so the curve reads as growth.
    const totals = runningTotal(aggregated);
    if (sortedLabels.length > 0) {
      labels = [previousPeriodLabel(sortedLabels[0], config.x_bin), ...sortedLabels];
      values = [0, ...totals];
    } else {
      values = totals;
    }
  } else {
    values = aggregated;
  }

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
      className="flex flex-1 flex-col min-w-0 rounded-lg border border-orange-100 bg-white p-4 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-emerald-600">{config.title}</h3>
      <div {...chartAreaProps(config)}>
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
