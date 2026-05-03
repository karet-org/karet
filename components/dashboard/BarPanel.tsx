"use client";

// Bar panel: groups rows by `group_by`, aggregates `value` with `agg`,
// sorts by aggregated value descending, optionally limits to top N,
// renders a horizontal Chart.js Bar.

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
import type { Panel } from "@/lib/types/dashboard";
import { CHART_ACCENT, CHART_PALETTE } from "@/lib/dashboard/palette";
import { groupAndAggregate } from "./aggregate";
import type { PanelProps, CrossFilterProps } from "./types";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
);

type BarPanelConfig = Extract<Panel, { kind: "bar" }>;

export function BarPanel({ config, rows, onFilter, activeFilter }: PanelProps<BarPanelConfig> & CrossFilterProps) {
  const totals = groupAndAggregate(rows, config.group_by, config.value, config.agg);
  const entries = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
  const limited =
    typeof config.limit === "number" && config.limit > 0
      ? entries.slice(0, config.limit)
      : entries;
  const labels = limited.map(([k]) => k);
  const values = limited.map(([, v]) => v);

  const isFiltered = activeFilter && activeFilter.column === config.group_by;

  const data = {
    labels,
    datasets: [
      {
        label: config.title,
        data: values,
        backgroundColor: labels.map((label, i) => {
          const base = CHART_PALETTE[i % CHART_PALETTE.length];
          if (isFiltered && label !== activeFilter.value) return base + "33";
          return base;
        }),
        borderWidth: labels.map((label) =>
          isFiltered && label === activeFilter.value ? 3 : 1,
        ),
        borderColor: labels.map((label) =>
          isFiltered && label === activeFilter.value ? CHART_ACCENT : "transparent",
        ),
      },
    ],
  };

  const options = {
    indexAxis: "y" as const,
    responsive: true,
    maintainAspectRatio: false,
    onClick: (_event: unknown, elements: { index: number }[]) => {
      if (elements.length > 0 && onFilter) {
        const label = labels[elements[0].index];
        if (label) onFilter(config.group_by, label);
      }
    },
    plugins: {
      legend: { display: false },
    },
    scales: {
      x: { beginAtZero: true },
      y: { grid: { display: false } },
    },
  };

  return (
    <div
      data-testid="bar-panel"
      className="rounded-md border border-gray-200 bg-white p-4"
    >
      <h3 className="text-sm font-semibold text-gray-800">{config.title}</h3>
      <div className="relative mt-3 h-64">
        {labels.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            No data
          </div>
        ) : (
          <Bar data={data} options={options} />
        )}
      </div>
    </div>
  );
}

export default BarPanel;
