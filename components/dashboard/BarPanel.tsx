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
import { formatLabel } from "@/lib/dashboard/format";
import { barColors, CHART_ACCENT } from "@/lib/dashboard/palette";
import type { Params } from "@/lib/services/dashboard-data";
import { pivotSeries } from "./series";
import { type PanelProps } from "./types";
import { ChartCard, emitOptions } from "./ChartCard";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

type BarConfig = Extract<PanelV2, { kind: "bar" }>;

function BarPanel({
  config,
  data,
  params,
  onEmit,
}: PanelProps<BarConfig> & { params?: Params; onEmit?: (param: string, value: string) => void }) {
  const { labels, datasets } = pivotSeries(data.rows, config.x, config.y, config.series);
  const emit = config.emit;
  const active = emit ? (params?.[emit.param] ?? null) : null;

  const categoryTick = (_v: unknown, i: number) => formatLabel(labels[i] ?? "");

  const chartData = {
    labels,
    datasets: datasets.map((d, i) => ({
      label: d.name ?? config.title,
      data: d.values,
      backgroundColor: barColors(labels, i, active),
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
    ...emitOptions(labels, emit, onEmit),
    plugins: {
      legend: { display: datasets.length > 1 },
      tooltip: {
        callbacks: { title: (items: { label: string }[]) => (items[0] ? formatLabel(items[0].label) : "") },
      },
    },
    // Labels stay raw because `emit` sends them as the filter value; only
    // what is drawn is shortened.
    scales: config.horizontal
      ? { x: { beginAtZero: true }, y: { grid: { display: false }, ticks: { callback: categoryTick } } }
      : { x: { grid: { display: false }, ticks: { callback: categoryTick } }, y: { beginAtZero: true } },
  };

  return (
    <ChartCard testId="bar-panel" config={config} empty={labels.length === 0}>
      <Bar data={chartData} options={options} />
    </ChartCard>
  );
}

export default BarPanel;
