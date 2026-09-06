"use client";

import dynamic from "next/dynamic";
import type { Panel } from "@/lib/types/dashboard";
import ErrorPanel from "./ErrorPanel";
import KpiPanel from "./KpiPanel";
import SummaryPanel from "./SummaryPanel";
import TablePanel from "./TablePanel";
import { missingColumns, type CrossFilterProps, type PanelProps } from "./types";

// Chart.js, chartjs-chart-geo, d3-sankey, and topojson are heavy and only
// needed by these panels, so load them on demand. KPI/Summary/Table/Error
// are light and stay in the main bundle.
function PanelLoading() {
  return (
    <div className="flex flex-1 items-center justify-center rounded-[13px] border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)] p-4 text-sm text-[color:var(--color-ink-3)] shadow-sm">
      Loading…
    </div>
  );
}
const loading = () => <PanelLoading />;
const BarPanel = dynamic(() => import("./BarPanel"), { loading });
const DoughnutPanel = dynamic(() => import("./DoughnutPanel"), { loading });
const LinePanel = dynamic(() => import("./LinePanel"), { loading });
const SankeyPanel = dynamic(() => import("./SankeyPanel"), { loading });
const SymbolMapPanel = dynamic(() => import("./SymbolMapPanel"), { loading });
const ChoroplethMapPanel = dynamic(() => import("./ChoroplethMapPanel"), { loading });

export function PanelRenderer({
  config,
  rows,
  schema,
  onFilter,
  activeFilter,
}: PanelProps<Panel> & CrossFilterProps) {
  const missing = missingColumns(config, schema);
  if (missing.length > 0) {
    return <ErrorPanel title={config.title} missingColumns={missing} />;
  }
  switch (config.kind) {
    case "kpi":
      return <KpiPanel config={config} rows={rows} schema={schema} />;
    case "summary":
      return <SummaryPanel config={config} rows={rows} schema={schema} />;
    case "doughnut":
      return <DoughnutPanel config={config} rows={rows} schema={schema} onFilter={onFilter} activeFilter={activeFilter} />;
    case "line":
      return <LinePanel config={config} rows={rows} schema={schema} />;
    case "bar":
      return <BarPanel config={config} rows={rows} schema={schema} onFilter={onFilter} activeFilter={activeFilter} />;
    case "table":
      return <TablePanel config={config} rows={rows} schema={schema} />;
    case "symbol_map":
      return <SymbolMapPanel config={config} rows={rows} schema={schema} />;
    case "choropleth_map":
      return <ChoroplethMapPanel config={config} rows={rows} schema={schema} onFilter={onFilter} activeFilter={activeFilter} />;
    case "sankey":
      return <SankeyPanel config={config} rows={rows} schema={schema} onFilter={onFilter} activeFilter={activeFilter} />;
  }
}

export default PanelRenderer;
