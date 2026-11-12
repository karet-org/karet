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
import { formatLabel } from "@/lib/dashboard/format";
import { CHART_PALETTE, CHART_SURFACE } from "@/lib/dashboard/palette";
import { hoverGuidePlugin, lineHoverOptions } from "./line-hover";
import { pivotSeries } from "./series";
import { chartAreaProps, panelCardClass, type PanelProps } from "./types";

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Title, Tooltip, Legend);

type LineConfig = Extract<PanelV2, { kind: "line" }>;

function LinePanel({ config, data }: PanelProps<LineConfig>) {
  const { labels, datasets } = pivotSeries(data.rows, config.x, config.y, config.series);

  const chartData = {
    labels,
    datasets: datasets.map((d, i) => ({
      label: d.name ?? config.title,
      data: d.values,
      borderColor: CHART_PALETTE[i % CHART_PALETTE.length],
      backgroundColor: CHART_PALETTE[i % CHART_PALETTE.length],
      pointRadius: labels.length > 60 ? 0 : 2,
      pointHoverRadius: 5,
      pointHoverBorderWidth: 2,
      pointHoverBorderColor: CHART_SURFACE,
      tension: 0.25,
      spanGaps: true,
    })),
  };

  const { interaction, tooltip } = lineHoverOptions(datasets.length);
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction,
    plugins: { legend: { display: datasets.length > 1 }, tooltip },
    scales: {
      // Labels stay raw for the data; only what is drawn is shortened.
      x: { grid: { display: false }, ticks: { callback: (_v: unknown, i: number) => formatLabel(labels[i] ?? "") } },
      y: { beginAtZero: false },
    },
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
          <Line data={chartData} options={options} plugins={[hoverGuidePlugin]} />
        )}
      </div>
    </div>
  );
}

export default LinePanel;
