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
import { formatLabel, labelTimes } from "@/lib/dashboard/format";
import { CHART_PALETTE, CHART_SURFACE } from "@/lib/dashboard/palette";
import { hoverGuidePlugin, lineHoverOptions } from "./line-hover";
import { pivotSeries } from "./series";
import { type PanelProps } from "./types";
import { ChartCard } from "./ChartCard";

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Title, Tooltip, Legend);

type LineConfig = Extract<PanelV2, { kind: "line" }>;

const DAY_MS = 86_400_000;

/**
 * An x axis that places dates by time, so a gap of weeks is wider than a gap
 * of a day. Ticks fall on whole days, at most about ten of them.
 */
function timeAxis(times: number[]) {
  const min = Math.min(...times);
  const max = Math.max(...times);
  const days = (max - min) / DAY_MS;
  return {
    type: "linear" as const,
    min,
    max,
    grid: { display: false },
    ticks: {
      stepSize: days >= 2 ? DAY_MS * Math.ceil(days / 10) : undefined,
      callback: (v: number | string) => formatLabel(new Date(Number(v)).toISOString()),
    },
  };
}

function LinePanel({ config, data }: PanelProps<LineConfig>) {
  const { labels, datasets } = pivotSeries(data.rows, config.x, config.y, config.series);
  const times = labelTimes(labels);

  const chartData = {
    labels,
    datasets: datasets.map((d, i) => ({
      label: d.name ?? config.title,
      data: times ? d.values.map((y, j) => ({ x: times[j], y })) : d.values,
      borderColor: CHART_PALETTE[i % CHART_PALETTE.length],
      backgroundColor: CHART_PALETTE[i % CHART_PALETTE.length],
      pointRadius: labels.length > 60 ? 0 : 2,
      pointHoverRadius: 5,
      pointHoverBorderWidth: 2,
      pointHoverBorderColor: CHART_SURFACE,
      tension: 0,
      spanGaps: true,
    })),
  };

  const { interaction, tooltip } = lineHoverOptions(labels, datasets.length);
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction,
    plugins: { legend: { display: datasets.length > 1 }, tooltip },
    scales: {
      // Labels stay raw for the data; only what is drawn is shortened.
      x: times
        ? timeAxis(times)
        : { grid: { display: false }, ticks: { callback: (_v: unknown, i: number) => formatLabel(labels[i] ?? "") } },
      y: { beginAtZero: false },
    },
  };

  return (
    <ChartCard testId="line-panel" config={config} empty={labels.length === 0}>
      <Line data={chartData} options={options} plugins={[hoverGuidePlugin]} />
    </ChartCard>
  );
}

export default LinePanel;
