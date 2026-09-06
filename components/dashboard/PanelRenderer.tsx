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
import { chartAreaProps, panelCardClass, type PanelData } from "./types";
import type { Params } from "@/lib/services/dashboard-data";

/**
 * Loading placeholder with the same geometry as the rendered panel:
 * identical card, title row, and area-sizing classes, plus per-kind
 * intrinsic heights (KPI tile, table rows from page_size, sankey's
 * fixed height). The data swap then changes pixels, not layout.
 */
function PanelSkeleton({ panel }: { panel: PanelV2 }) {
  const title = (
    <h3 className="text-sm font-semibold text-[color:var(--color-leaf-deep)]">{panel.title}</h3>
  );

  if (panel.kind === "kpi") {
    return (
      <div className={`${panelCardClass()} p-3`} aria-busy>
        <div className="text-[11px] font-medium text-[color:var(--color-ink-3)]">
          {panel.title}
        </div>
        <div className="skeleton mt-1.5 h-7 w-24 rounded" />
      </div>
    );
  }

  if (panel.kind === "summary") {
    return (
      <div className={panelCardClass()} aria-busy>
        {title}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="skeleton h-[52px] rounded" />
          <div className="skeleton h-[52px] rounded" />
        </div>
      </div>
    );
  }

  if (panel.kind === "table") {
    const rows = Math.min(panel.page_size ?? 10, 15);
    // Mirrors .data-table metrics: 35px header, 41px rows (11px cell
    // padding + 13px type + border), 36px pagination bar.
    return (
      <div className={panelCardClass()} aria-busy>
        {title}
        <div className="mt-3 flex-1">
          <div className="skeleton mb-[3px] h-[32px] rounded opacity-60" />
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="skeleton mb-[3px] h-[38px] rounded" />
          ))}
        </div>
        <div className="skeleton mt-3 h-[26px] w-full rounded opacity-60" />
      </div>
    );
  }

  if (panel.kind === "sankey") {
    // Mirrors SankeyPanel: fixed height from grid.maxHeight, else 320px.
    const h = panel.grid?.maxHeight ?? "320px";
    return (
      <div className={panelCardClass()} aria-busy>
        {title}
        <div className="skeleton mt-3 rounded" style={{ height: h }} />
      </div>
    );
  }

  // Chart kinds share the chart-area sizing (aspect / maxHeight / min-h).
  const area = chartAreaProps(panel);
  return (
    <div className={panelCardClass()} aria-busy>
      {title}
      <div {...area}>
        <div className="skeleton h-full w-full rounded" />
      </div>
    </div>
  );
}

export function PanelRenderer({
  panel,
  result,
  params,
  onEmit,
}: {
  panel: PanelV2;
  result: PanelData | { error: string } | undefined;
  params: Params;
  onEmit: (param: string, value: string) => void;
}) {
  if (!result) return <PanelSkeleton panel={panel} />;
  if ("error" in result) {
    return <ErrorPanel title={panel.title} message={result.error} />;
  }
  switch (panel.kind) {
    case "kpi":
      return <KpiPanel config={panel} data={result} />;
    case "bar":
      return <BarPanel config={panel} data={result} params={params} onEmit={onEmit} />;
    case "line":
      return <LinePanel config={panel} data={result} />;
    case "doughnut":
      return <DoughnutPanel config={panel} data={result} params={params} onEmit={onEmit} />;
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
