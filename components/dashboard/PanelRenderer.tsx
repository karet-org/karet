"use client";

// Dispatch a v2 panel to its component, or an ErrorPanel when its query
// failed. Failures are isolated per panel.

import type { PanelV2 } from "@/lib/types/dashboard-v2";
import BarPanel from "./BarPanel";
import DoughnutPanel from "./DoughnutPanel";
import ErrorPanel from "./ErrorPanel";
import KpiPanel from "./KpiPanel";
import LinePanel from "./LinePanel";
import SankeyPanel from "./SankeyPanel";
import SummaryPanel from "./SummaryPanel";
import TablePanel from "./TablePanel";
import ChoroplethMapPanel from "./ChoroplethMapPanel";
import SymbolMapPanel from "./SymbolMapPanel";
import type { PanelData } from "./types";

export function PanelRenderer({
  panel,
  result,
}: {
  panel: PanelV2;
  result: PanelData | { error: string } | undefined;
}) {
  if (!result) {
    return (
      <div className="flex flex-1 animate-pulse items-center justify-center rounded-[13px] border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)] p-4 text-sm text-[color:var(--color-ink-4)]">
        Loading…
      </div>
    );
  }
  if ("error" in result) {
    return <ErrorPanel title={panel.title} message={result.error} />;
  }
  switch (panel.kind) {
    case "kpi":
      return <KpiPanel config={panel} data={result} />;
    case "bar":
      return <BarPanel config={panel} data={result} />;
    case "line":
      return <LinePanel config={panel} data={result} />;
    case "doughnut":
      return <DoughnutPanel config={panel} data={result} />;
    case "table":
      return <TablePanel config={panel} data={result} />;
    case "sankey":
      return <SankeyPanel config={panel} data={result} />;
    case "choropleth_map":
      return <ChoroplethMapPanel config={panel} data={result} />;
    case "symbol_map":
      return <SymbolMapPanel config={panel} data={result} />;
    case "summary":
      return <SummaryPanel config={panel} data={result} />;
  }
}

export default PanelRenderer;
