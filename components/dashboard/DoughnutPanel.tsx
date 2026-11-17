// Doughnut panel: label/value bound columns.

import { ArcElement, Chart as ChartJS, Legend, Tooltip } from "chart.js";
import { Doughnut } from "react-chartjs-2";
import type { PanelV2 } from "@/lib/types/dashboard-v2";
import { CHART_ACCENT, CHART_PALETTE, CHART_SURFACE } from "@/lib/dashboard/palette";
import type { Params } from "@/lib/services/dashboard-data";
import { toNum } from "@/lib/dashboard/format";
import { type PanelProps } from "./types";
import { ChartCard, emitOptions } from "./ChartCard";

ChartJS.register(ArcElement, Tooltip, Legend);

type DoughnutConfig = Extract<PanelV2, { kind: "doughnut" }>;

function DoughnutPanel({
  config,
  data,
  params,
  onEmit,
}: PanelProps<DoughnutConfig> & { params?: Params; onEmit?: (param: string, value: string) => void }) {
  const labels = data.rows.map((r) => String(r[config.label] ?? ""));
  const values = data.rows.map((r) => toNum(r[config.value]) ?? 0);
  const emit = config.emit;
  const active = emit ? (params?.[emit.param] ?? null) : null;

  const chartData = {
    labels,
    datasets: [
      {
        data: values,
        backgroundColor: labels.map((label, i) => {
          const base = CHART_PALETTE[i % CHART_PALETTE.length];
          return active !== null && label !== active ? base + "40" : base;
        }),
        borderColor: labels.map((label) =>
          active !== null && label === active ? CHART_ACCENT : CHART_SURFACE,
        ),
        borderWidth: 2,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    ...emitOptions(labels, emit, onEmit),
    plugins: {
      legend: { position: "bottom" as const, labels: { boxWidth: 12, font: { size: 10 } } },
    },
  };

  return (
    <ChartCard testId="doughnut-panel" config={config} empty={labels.length === 0}>
      <Doughnut data={chartData} options={options} />
    </ChartCard>
  );
}

export default DoughnutPanel;
