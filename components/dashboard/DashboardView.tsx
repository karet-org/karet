"use client";

// DashboardView renders a full dashboard: a FilterBar, followed by each
// Panel in the configured order. Panels whose `columns`/`group_by`/etc.
// reference a column missing from the Analytic_Table schema render as an
// ErrorPanel -- the rest of the dashboard continues to render.
//
// The component is pure in its inputs: given a config, rows, and schema,
// it deterministically produces the same DOM tree. That purity is what
// the property tests rely on.

import { useMemo, useState } from "react";
import type { ColumnSchema } from "@/lib/types/config";
import type { DashboardConfig } from "@/lib/types/dashboard";
import {
  applyFilters,
  emptyFilterState,
  type FilterState,
} from "./FilterBar";
import FilterBar from "./FilterBar";
import PanelRenderer from "./PanelRenderer";
import type { Row } from "./types";

export interface DashboardViewProps {
  config: DashboardConfig;
  rows: Row[];
  schema: ColumnSchema[];
}

export function DashboardView({ config, rows, schema }: DashboardViewProps) {
  const [filterState, setFilterState] = useState<FilterState>(emptyFilterState);
  const [chartFilter, setChartFilter] = useState<{ column: string; value: string } | null>(null);

  const baseFilteredRows = useMemo(() => applyFilters(rows, filterState), [rows, filterState]);

  const filteredRows = useMemo(() => {
    if (!chartFilter) return baseFilteredRows;
    return baseFilteredRows.filter((r) => String(r[chartFilter.column] ?? "") === chartFilter.value);
  }, [baseFilteredRows, chartFilter]);

  const handleChartFilter = (column: string, value: string) => {
    setChartFilter((prev) =>
      prev && prev.column === column && prev.value === value ? null : { column, value },
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
  // Fallback to Tailwind column classes when no explicit gridTemplateColumns
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
        rows={rows}
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
          return (
            <div
              key={i}
              style={panelStyle}
              className="flex"
              data-testid="panel-slot"
              data-panel-index={i}
              data-panel-title={panel.title}
            >
              <PanelRenderer
                config={panel}
                rows={panel.kind === "doughnut" || panel.kind === "bar" ? baseFilteredRows : filteredRows}
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
