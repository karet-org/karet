// TypeScript mirror of the Dashboard configuration schema.

export type FilterKind = "dropdown" | "date_range";

export interface DashboardFilter {
  kind: FilterKind;
  column: string;
  label: string;
}

export type Aggregation = "sum" | "count" | "avg" | "min" | "max";

/** Per-panel CSS grid placement. */
export interface PanelGrid {
  gridColumn?: string;
  gridRow?: string;
}

export type Panel =
  | {
      kind: "summary";
      title: string;
      columns: string[];
      grid?: PanelGrid;
    }
  | {
      kind: "doughnut";
      title: string;
      group_by: string;
      value: string;
      agg: Aggregation;
      grid?: PanelGrid;
    }
  | {
      kind: "line";
      title: string;
      x: string;
      x_bin?: "day" | "week" | "month" | "year";
      y: string;
      agg: Aggregation;
      grid?: PanelGrid;
    }
  | {
      kind: "bar";
      title: string;
      group_by: string;
      value: string;
      agg: Aggregation;
      limit?: number;
      grid?: PanelGrid;
    }
  | {
      kind: "table";
      title: string;
      columns: string[];
      page_size?: number;
      grid?: PanelGrid;
    }
  | {
      kind: "symbol_map";
      title: string;
      /** Column containing the latitude (degrees). */
      lat: string;
      /** Column containing the longitude (degrees). */
      lon: string;
      /** Column whose values are aggregated per point. Optional — omit
       *  for `count` rows-per-point. */
      value?: string;
      agg: Aggregation;
      /** Max circle radius in SVG units. Defaults to 20. */
      max_radius?: number;
      grid?: PanelGrid;
    }
  | {
      kind: "choropleth_map";
      title: string;
      /** Column containing the country identifier (alpha-2, alpha-3,
       *  numeric, or common name — resolved via the ISO-3166 lookup). */
      country: string;
      /** Column whose values are aggregated per country. Optional — omit
       *  for `count` rows-per-country. */
      value?: string;
      agg: Aggregation;
      grid?: PanelGrid;
    };

export interface DashboardConfig {
  id: string;
  name: string;
  analytic_table_id: string;
  filters: DashboardFilter[];
  panels: Panel[];
  layout?: {
    columns?: number;
    /** CSS grid-template-columns, e.g. "1fr 1fr 1fr" or "repeat(3, 1fr)". Overrides `columns`. */
    gridTemplateColumns?: string;
    /** CSS grid-template-rows. */
    gridTemplateRows?: string;
    /** CSS gap, e.g. "1rem" or "16px". */
    gap?: string;
  };
}
