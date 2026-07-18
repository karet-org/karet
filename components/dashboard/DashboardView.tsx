"use client";

// DashboardView renders a full dashboard: FilterBar + each Panel in
// order. Panels referencing a column missing from the table render as
// ErrorPanel; the rest of the dashboard continues to render.
//
// Pure in its inputs (config, rows, schema), the property tests rely
// on that.

import { useMemo, useState } from "react";
import type { ColumnSchema } from "@/lib/types/config";
import type { DashboardConfig, Panel } from "@/lib/types/dashboard";
import { applyWhere } from "@/lib/dashboard/evalWhere";
import {
  applyFilters,
  emptyFilterState,
  type FilterState,
} from "./FilterBar";
import FilterBar from "./FilterBar";
import PanelRenderer from "./PanelRenderer";
import { binDate } from "./aggregate";
import type { ChartFilter, ChartFilterBin, Row } from "./types";

export interface DashboardViewProps {
  config: DashboardConfig;
  rows: Row[];
  schema: ColumnSchema[];
}

/**
 * `true` iff `panel` emits the shape of `filter`. The emitter is exempt
 * from its own filter so e.g. a clicked doughnut doesn't collapse to
 * one slice; non-emitting panels still get filtered.
 */
function panelEmitsFilter(panel: Panel, filter: ChartFilter): boolean {
  switch (panel.kind) {
    case "doughnut":
      return panel.group_by === filter.column && filter.bin === undefined;
    case "bar":
      return panel.group_by === filter.column && panel.x_bin === filter.bin;
    case "choropleth_map":
      return panel.country === filter.column && filter.bin === undefined;
    case "sankey":
      return (
        filter.bin === undefined &&
        panel.flows.some(
          (f) => f.from === filter.column || f.to === filter.column,
        )
      );
    default:
      return false;
  }
}

export function DashboardView({ config, rows, schema }: DashboardViewProps) {
  const [filterState, setFilterState] = useState<FilterState>(emptyFilterState);
  const [chartFilter, setChartFilter] = useState<ChartFilter | null>(null);

  // The dashboard-level `where` is applied first; FilterBar dropdowns
  // also derive their options from this set so excluded values aren't
  // selectable.
  const whereFiltered = useMemo(
    () => applyWhere(rows, config.where),
    [rows, config.where],
  );

  const baseFilteredRows = useMemo(
    () => applyFilters(whereFiltered, filterState),
    [whereFiltered, filterState],
  );

  const filteredRows = useMemo(() => {
    if (!chartFilter) return baseFilteredRows;
    if (chartFilter.bin) {
      return baseFilteredRows.filter(
        (r) => binDate(r[chartFilter.column], chartFilter.bin) === chartFilter.value,
      );
    }
    return baseFilteredRows.filter(
      (r) => String(r[chartFilter.column] ?? "") === chartFilter.value,
    );
  }, [baseFilteredRows, chartFilter]);

  const handleChartFilter = (column: string, value: string, bin?: ChartFilterBin) => {
    setChartFilter((prev) =>
      prev && prev.column === column && prev.value === value && prev.bin === bin
        ? null
        : { column, value, bin },
    );
  };

  const layout = config.layout;
  const gridStyle: React.CSSProperties = layout?.gridTemplateColumns
    ? {
        display: "grid",
        gridTemplateColumns: layout.gridTemplateColumns,
        ...(layout.gridTemplateRows ? { gridTemplateRows: layout.gridTemplateRows } : {}),
        gap: layout.gap ?? "1rem",
      }
    : {};
  // Fallback to Tailwind column classes when no explicit gridTemplateColumns.
  const columns = layout?.columns ?? 2;
  const gridClass = layout?.gridTemplateColumns
    ? ""
    : columns === 1
      ? "grid grid-cols-1 gap-4"
      : columns === 3
        ? "grid grid-cols-1 md:grid-cols-3 gap-4"
        : columns === 4
          ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
          : "grid grid-cols-1 md:grid-cols-2 gap-4";

  return (
    <div data-testid="dashboard-view" className="space-y-4">
      <FilterBar
        filters={config.filters}
        rows={whereFiltered}
        state={filterState}
        onChange={setFilterState}
        chartFilter={chartFilter}
        onClearChartFilter={() => setChartFilter(null)}
      />
      <div className={gridClass} style={gridStyle} data-testid="panel-grid">
        {config.panels.map((panel, i) => {
          const panelStyle: React.CSSProperties = {};
          if (panel.grid?.gridColumn) panelStyle.gridColumn = panel.grid.gridColumn;
          if (panel.grid?.gridRow) panelStyle.gridRow = panel.grid.gridRow;
          // `data-panel-span` enables the @container query in
          // globals.css to collapse `span N` to full-width when the
          // grid only has one explicit column.
          const spanMatch =
            typeof panel.grid?.gridColumn === "string"
              ? panel.grid.gridColumn.match(/^span\s+(\d+)$/i)
              : null;
          const panelSpan = spanMatch ? Number(spanMatch[1]) : undefined;
          const isFilterSource =
            chartFilter !== null && panelEmitsFilter(panel, chartFilter);
          const rowsForPanel = isFilterSource ? baseFilteredRows : filteredRows;
          return (
            <div
              key={i}
              style={panelStyle}
              className="flex min-w-0"
              data-testid="panel-slot"
              data-panel-index={i}
              data-panel-title={panel.title}
              data-panel-span={panelSpan}
            >
              <PanelRenderer
                config={panel}
                rows={rowsForPanel}
                schema={schema}
                onFilter={handleChartFilter}
                activeFilter={chartFilter}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default DashboardView;
