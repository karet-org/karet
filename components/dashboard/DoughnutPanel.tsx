"use client";

// Doughnut panel: groups rows by `group_by`, aggregates `value` with `agg`,
// renders a Chart.js Doughnut.

import {
  ArcElement,
  Chart as ChartJS,
  Legend,
  Tooltip,
} from "chart.js";
import { Doughnut } from "react-chartjs-2";
import type { Panel } from "@/lib/types/dashboard";
import { CHART_ACCENT, CHART_PALETTE } from "@/lib/dashboard/palette";
import { groupAndAggregate } from "./aggregate";
import type { PanelProps, CrossFilterProps } from "./types";

ChartJS.register(ArcElement, Tooltip, Legend);

type DoughnutPanelConfig = Extract<Panel, { kind: "doughnut" }>;

export function DoughnutPanel({
  config,
  rows,
  onFilter,
  activeFilter,
}: PanelProps<DoughnutPanelConfig> & CrossFilterProps) {
  const totals = groupAndAggregate(rows, config.group_by, config.value, config.agg);
  const labels = Array.from(totals.keys());
  const values = Array.from(totals.values());

  const isFiltered = activeFilter && activeFilter.column === config.group_by;

  const data = {
    labels,
    datasets: [
      {
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
          isFiltered && label === activeFilter.value ? CHART_ACCENT : "#fff",
        ),
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    onClick: (_event: unknown, elements: { index: number }[]) => {
      if (elements.length > 0 && onFilter) {
        const label = labels[elements[0].index];
        if (label) onFilter(config.group_by, label);
      }
    },
    plugins: {
      legend: { position: "right" as const },
    },
  };

  return (
    <div
      data-testid="doughnut-panel"
      className="rounded-md border border-gray-200 bg-white p-4"
    >
      <h3 className="text-sm font-semibold text-gray-800">{config.title}</h3>
      <div className="relative mt-3 h-64">
        {labels.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            No data
          </div>
        ) : (
          <Doughnut data={data} options={options} />
        )}
      </div>
    </div>
  );
}

export default DoughnutPanel;
