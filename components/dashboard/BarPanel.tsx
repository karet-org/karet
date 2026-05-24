"use client";

// Bar panel. Two shapes:
//   - Without `x_bin`: top-N horizontal bars (`indexAxis: "y"`),
//     sorted by aggregated value descending, optional `limit`.
//   - With `x_bin`: vertical bars over `binDate(group_by, x_bin)`,
//     sorted chronologically, no `limit`.
//
// Both forms emit cross-filter clicks; the binned form passes `x_bin`
// so DashboardView matches rows by `binDate`.

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
import { toNum } from "@/lib/dashboard/format";
import { aggregateValues, binDate, groupAndAggregate } from "./aggregate";
import { chartAreaProps, type CrossFilterProps, type PanelProps } from "./types";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
);

type BarPanelConfig = Extract<Panel, { kind: "bar" }>;

/** `(labels, values)` pair derived from `rows` per the panel config. */
function computeData(
  rows: Record<string, unknown>[],
  config: BarPanelConfig,
): { labels: string[]; values: number[] } {
  if (config.x_bin) {
    const buckets = new Map<string, number[]>();
    for (const row of rows) {
      const key = binDate(row[config.group_by], config.x_bin);
      const v = toNum(row[config.value]) ?? 0;
      const bucket = buckets.get(key);
      if (bucket) bucket.push(v);
      else buckets.set(key, [v]);
    }
    const labels = Array.from(buckets.keys()).sort();
    const values = labels.map((k) =>
      aggregateValues(buckets.get(k) ?? [], config.agg),
    );
    return { labels, values };
  }
  const totals = groupAndAggregate(rows, config.group_by, config.value, config.agg);
  const entries = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
  const limited =
    typeof config.limit === "number" && config.limit > 0
      ? entries.slice(0, config.limit)
      : entries;
  return {
    labels: limited.map(([k]) => k),
    values: limited.map(([, v]) => v),
  };
}

export function BarPanel({
  config,
  rows,
  onFilter,
  activeFilter,
}: PanelProps<BarPanelConfig> & CrossFilterProps) {
  const { labels, values } = computeData(rows, config);

  // Only treat the active filter as ours when both column and bin
  // shape match. A doughnut filter on `category` shouldn't dim a
  // bar grouped by `merchant` or binned by month.
  const isFiltered =
    activeFilter !== null &&
    activeFilter !== undefined &&
    activeFilter.column === config.group_by &&
    activeFilter.bin === config.x_bin;

  const data = {
    labels,
    datasets: [
      {
        label: config.title,
        data: values,
        backgroundColor: labels.map((label, i) => {
          const base = CHART_PALETTE[i % CHART_PALETTE.length];
          if (isFiltered && label !== activeFilter!.value) return base + "33";
          return base;
        }),
        borderWidth: labels.map((label) =>
          isFiltered && label === activeFilter!.value ? 3 : 1,
        ),
        borderColor: labels.map((label) =>
          isFiltered && label === activeFilter!.value ? CHART_ACCENT : "transparent",
        ),
      },
    ],
  };

  const options = {
    indexAxis: config.x_bin ? ("x" as const) : ("y" as const),
    responsive: true,
    maintainAspectRatio: false,
    onClick: (_event: unknown, elements: { index: number }[]) => {
      if (elements.length > 0 && onFilter) {
        const label = labels[elements[0].index];
        if (label) onFilter(config.group_by, label, config.x_bin);
      }
    },
    onHover: (event: { native: Event | null }, elements: unknown[]) => {
      const target = event.native?.target as HTMLElement | null;
      if (target) target.style.cursor = elements.length > 0 ? "pointer" : "default";
    },
    plugins: {
      legend: { display: false },
    },
    scales: config.x_bin
      ? {
          x: { grid: { display: false } },
          y: { beginAtZero: true },
        }
      : {
          x: { beginAtZero: true },
          y: { grid: { display: false } },
        },
  };

  return (
    <div
      data-testid="bar-panel"
      className="flex flex-1 flex-col min-w-0 rounded-lg border border-orange-100 bg-white p-4 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-emerald-600">{config.title}</h3>
      <div {...chartAreaProps(config)}>
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
