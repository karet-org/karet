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
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--color-ink-3)]">
          {panel.title}
        </div>
        <div className="mt-1.5 h-7 w-24 animate-pulse rounded bg-[color:var(--color-surface-2)]" />
      </div>
    );
  }

  if (panel.kind === "summary") {
    return (
      <div className={panelCardClass()} aria-busy>
        {title}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="h-[52px] animate-pulse rounded bg-[color:var(--color-surface-2)]" />
          <div className="h-[52px] animate-pulse rounded bg-[color:var(--color-surface-2)]" />
        </div>
      </div>
    );
  }

  if (panel.kind === "table") {
    const rows = panel.page_size ?? 10;
    return (
      <div className={panelCardClass()} aria-busy>
        {title}
        <div className="mt-3 flex-1 space-y-[9px] pt-2">
          {Array.from({ length: Math.min(rows, 15) + 1 }, (_, i) => (
            <div
              key={i}
              className="h-[26px] animate-pulse rounded bg-[color:var(--color-surface-2)]"
              style={{ opacity: i === 0 ? 0.5 : 1 }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (panel.kind === "sankey") {
    // Mirrors SankeyPanel: fixed height from grid.maxHeight, else 320px.
    const h = panel.grid?.maxHeight ?? "320px";
    return (
      <div className={panelCardClass()} aria-busy>
        {title}
        <div className="mt-3 animate-pulse rounded bg-[color:var(--color-surface-2)]" style={{ height: h }} />
      </div>
    );
  }

  // Chart kinds share the chart-area sizing (aspect / maxHeight / min-h).
  const area = chartAreaProps(panel);
  return (
    <div className={panelCardClass()} aria-busy>
      {title}
      <div {...area}>
        <div className="h-full w-full animate-pulse rounded bg-[color:var(--color-surface-2)]" />
      </div>
    </div>
  );
}

export function PanelRenderer({
  panel,
  result,
}: {
  panel: PanelV2;
  result: PanelData | { error: string } | undefined;
}) {
  if (!result) return <PanelSkeleton panel={panel} />;
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
