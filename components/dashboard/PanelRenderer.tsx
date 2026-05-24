"use client";

import type { Panel } from "@/lib/types/dashboard";
import BarPanel from "./BarPanel";
import ChoroplethMapPanel from "./ChoroplethMapPanel";
import DoughnutPanel from "./DoughnutPanel";
import ErrorPanel from "./ErrorPanel";
import KpiPanel from "./KpiPanel";
import LinePanel from "./LinePanel";
import SankeyPanel from "./SankeyPanel";
import SummaryPanel from "./SummaryPanel";
import SymbolMapPanel from "./SymbolMapPanel";
import TablePanel from "./TablePanel";
import { missingColumns, type CrossFilterProps, type PanelProps } from "./types";

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
