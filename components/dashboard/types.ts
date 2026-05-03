// Shared types for generic dashboard panel components.
//
// Every panel accepts `{ config, rows, schema }` per the design. The panel
// implementations stay data-shape-agnostic; they only know how to read
// columns by name out of the row objects produced by
// `/api/tables/[table]/rows`.

import type { ColumnSchema } from "@/lib/types/config";
import type { Panel } from "@/lib/types/dashboard";

/** A single analytic-table row, keyed by column name. */
export type Row = Record<string, unknown>;

/** Panel props share the same tri-field shape across every kind. */
export interface PanelProps<P extends Panel = Panel> {
  config: P;
  rows: Row[];
  schema: ColumnSchema[];
}

/**
 * Cross-filter props for panels that emit and highlight a selection
 * (doughnut / bar / choropleth). `onFilter(column, value)` is a toggle:
 * passing the same pair clears the filter. `activeFilter` is broadcast
 * from the dashboard root so every panel can dim non-matching slices.
 */
export interface CrossFilterProps {
  onFilter?: (column: string, value: string) => void;
  activeFilter?: { column: string; value: string } | null;
}

/** Returns the set of column names required by a panel config. */
export function requiredColumns(panel: Panel): string[] {
  switch (panel.kind) {
    case "summary":
      return [...panel.columns];
    case "doughnut":
      return [panel.group_by, panel.value];
    case "line":
      return [panel.x, panel.y];
    case "bar":
      return [panel.group_by, panel.value];
    case "table":
      return [...panel.columns];
    case "symbol_map":
      return panel.value
        ? [panel.lat, panel.lon, panel.value]
        : [panel.lat, panel.lon];
    case "choropleth_map":
      return panel.value ? [panel.country, panel.value] : [panel.country];
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
