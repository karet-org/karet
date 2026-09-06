"use client";

// Doughnut panel: label/value bound columns.

import { ArcElement, Chart as ChartJS, Legend, Tooltip } from "chart.js";
import { Doughnut } from "react-chartjs-2";
import type { PanelV2 } from "@/lib/types/dashboard-v2";
import { CHART_PALETTE, CHART_SURFACE } from "@/lib/dashboard/palette";
import { toNum } from "@/lib/dashboard/format";
import { chartAreaProps, panelCardClass, type PanelProps } from "./types";

ChartJS.register(ArcElement, Tooltip, Legend);

type DoughnutConfig = Extract<PanelV2, { kind: "doughnut" }>;

export function DoughnutPanel({ config, data }: PanelProps<DoughnutConfig>) {
  const labels = data.rows.map((r) => String(r[config.label] ?? ""));
  const values = data.rows.map((r) => toNum(r[config.value]) ?? 0);

  const chartData = {
    labels,
    datasets: [
      {
        data: values,
        backgroundColor: labels.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]),
        borderColor: CHART_SURFACE,
        borderWidth: 2,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "bottom" as const, labels: { boxWidth: 12, font: { size: 10 } } },
    },
  };

  return (
    <div data-testid="doughnut-panel" className={panelCardClass()}>
      <h3 className="text-sm font-semibold text-[color:var(--color-leaf-deep)]">{config.title}</h3>
      <div {...chartAreaProps(config)}>
        {labels.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-[color:var(--color-ink-3)]">
            No data
          </div>
        ) : (
          <Doughnut data={chartData} options={options} />
        )}
      </div>
    </div>
  );
}

export default DoughnutPanel;
