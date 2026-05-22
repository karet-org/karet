// TypeScript mirror of the Dashboard configuration schema.

export type FilterKind = "dropdown" | "date_range";

export interface DashboardFilter {
  kind: FilterKind;
  column: string;
  label: string;
}

export type Aggregation = "sum" | "count" | "avg" | "min" | "max";

/** Per-panel CSS grid placement and chart-area sizing. */
export interface PanelGrid {
  gridColumn?: string;
  gridRow?: string;
  /**
   * Chart-area aspect ratio. `"square"` makes the chart inscribe a circle
   * (right shape for doughnuts), `"video"` is 16:9 (good for maps), and
   * `"auto"` (default) lets the chart fill whatever rectangle the row gives.
   * The chart still respects `maxHeight` as a ceiling so a square doughnut
   * doesn't blow up to column width on wide screens.
   */
  aspect?: "square" | "video" | "auto";
  /** CSS max-height for the chart area, e.g. `"20rem"`, `"320px"`. */
  maxHeight?: string;
}

/** Single tiled KPI: icon + label + one big aggregated value. */
export type KpiAgg = "sum" | "count" | "avg" | "min" | "max" | "mode";
export type KpiFormat = "number" | "currency" | "raw";
export type KpiIcon = "dollar" | "chart" | "shapes" | "calendar";

export type Panel =
  | {
      kind: "kpi";
      title: string;
      column: string;
      agg: KpiAgg;
      format?: KpiFormat;
      /** ISO 4217 currency code used when `format: "currency"`. Defaults to USD. */
      currency?: string;
      icon?: KpiIcon;
      /**
       * For `agg: "mode"`, the column whose values are summed for the
       * dominant `column` group. The result reads like
       * `Food ($7,632.01)`. Ignored for other aggs.
       */
      value_column?: string;
      grid?: PanelGrid;
    }
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
      /** Column whose values are aggregated per point. Optional -- omit
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
       *  numeric, or common name -- resolved via the ISO-3166 lookup). */
      country: string;
      /** Column whose values are aggregated per country. Optional -- omit
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
