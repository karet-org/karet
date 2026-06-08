// Shared types for generic dashboard panel components.
//
// Every panel accepts `{ config, rows, schema }` per the design. The panel
// implementations stay data-shape-agnostic; they only know how to read
// columns by name out of the row objects produced by
// `/api/tables/[table]/rows`.

import type { ColumnSchema } from "@/lib/types/config";
import type { Panel } from "@/lib/types/dashboard";
import { valueFieldColumns } from "@/lib/dashboard/evalValue";

/** A single analytic-table row, keyed by column name. */
export type Row = Record<string, unknown>;

/** Panel props share the same tri-field shape across every kind. */
export interface PanelProps<P extends Panel = Panel> {
  config: P;
  rows: Row[];
  schema: ColumnSchema[];
}

/**
 * Cross-filter props for panels that emit + highlight a selection
 * (doughnut / bar / choropleth / line). `onFilter` is a toggle: passing
 * the same triple clears the filter. `bin` is set when the value is a
 * date binned via `binDate` (line clicks); equality-style emitters omit
 * it.
 */
export interface CrossFilterProps {
  onFilter?: (column: string, value: string, bin?: ChartFilterBin) => void;
  activeFilter?: ChartFilter | null;
}

export type ChartFilterBin = "day" | "week" | "month" | "year";

export interface ChartFilter {
  column: string;
  value: string;
  bin?: ChartFilterBin;
}

/**
 * Chart-area wrapper className + inline style derived from a panel's
 * `grid.aspect` / `grid.maxHeight`.
 *
 * - `aspect: "auto"` (default): `flex-1 min-h-[16rem]`, fills the row.
 * - `aspect: "square"`: 1:1 box, centered with `mx-auto`.
 * - `aspect: "video"`: 16:9.
 *
 * `maxHeight` caps the chart so a square doughnut on a wide column
 * doesn't blow up vertically. For `aspect: "square"` we mirror it as
 * `maxWidth` so the box stays square (without that, `aspect-ratio: 1/1`
 * + `width: 100%` + `max-height` resolves to a non-square rectangle on
 * wide columns).
 *
 * `overflow-hidden` keeps a slow-to-resize Chart.js canvas from spilling
 * outside its slot during transient layout changes.
 */
export function chartAreaProps(panel: Panel): {
  className: string;
  style: React.CSSProperties;
} {
  const aspect = panel.grid?.aspect ?? "auto";
  const style: React.CSSProperties = {};
  if (panel.grid?.maxHeight) {
    style.maxHeight = panel.grid.maxHeight;
    if (aspect === "square") style.maxWidth = panel.grid.maxHeight;
  }

  if (aspect === "square") {
    return { className: "relative mt-3 mx-auto aspect-square w-full overflow-hidden", style };
  }
  if (aspect === "video") {
    return { className: "relative mt-3 mx-auto aspect-video w-full overflow-hidden", style };
  }
  return { className: "relative mt-3 min-h-[16rem] flex-1 overflow-hidden", style };
}

/** Returns the set of column names required by a panel config. */
export function requiredColumns(panel: Panel): string[] {
  switch (panel.kind) {
    case "kpi":
      return panel.value_column
        ? [...valueFieldColumns(panel.column), ...valueFieldColumns(panel.value_column)]
        : [...valueFieldColumns(panel.column)];
    case "summary":
      return [...panel.columns];
    case "doughnut":
      return [panel.group_by, ...valueFieldColumns(panel.value)];
    case "line":
      return [panel.x, ...valueFieldColumns(panel.y)];
    case "bar":
      return [panel.group_by, ...valueFieldColumns(panel.value)];
    case "table":
      return [...panel.columns];
    case "symbol_map":
      return panel.value
        ? [panel.lat, panel.lon, panel.value]
        : [panel.lat, panel.lon];
    case "choropleth_map":
      return panel.value ? [panel.country, panel.value] : [panel.country];
    case "sankey": {
      const cols: string[] = [];
      for (const f of panel.flows) cols.push(f.from, f.to, f.value);
      return cols;
    }
  }
}

/** Returns the subset of a panel's required columns that are missing from the schema. */
export function missingColumns(
  panel: Panel,
  schema: ColumnSchema[],
): string[] {
  const have = new Set(schema.map((c) => c.name));
  return requiredColumns(panel).filter((c) => !have.has(c));
}
