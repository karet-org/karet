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
import { CHART_ACCENT, CHART_PALETTE, CHART_SURFACE } from "@/lib/dashboard/palette";
import { groupAndAggregate } from "./aggregate";
import { chartAreaProps, type PanelProps, type CrossFilterProps } from "./types";

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
          isFiltered && label === activeFilter.value ? CHART_ACCENT : CHART_SURFACE,
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
    onHover: (event: { native: Event | null }, elements: unknown[]) => {
      const target = event.native?.target as HTMLElement | null;
      if (target) target.style.cursor = elements.length > 0 ? "pointer" : "default";
    },
    plugins: {
      legend: {
        position: "bottom" as const,
        labels: {
          boxWidth: 12,
          padding: 8,
          font: { size: 11 },
        },
      },
    },
  };

  return (
    <div
      data-testid="doughnut-panel"
      className="flex flex-1 flex-col min-w-0 rounded-lg border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)] p-4 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-emerald-600">{config.title}</h3>
      <div {...chartAreaProps(config)}>
        {labels.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-[color:var(--color-ink-3)]">
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
