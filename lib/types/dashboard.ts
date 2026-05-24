// TypeScript mirror of the Dashboard configuration schema.

import type { AstNode } from "@/lib/types/config";

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
      /** When set, group by `binDate(group_by, x_bin)` as vertical, chronologically sorted bars (no `limit`). */
      x_bin?: "day" | "week" | "month" | "year";
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
      /** Column aggregated per point. Omit for `count` rows-per-point. */
      value?: string;
      agg: Aggregation;
      /** Max circle radius in SVG units. Defaults to 20. */
      max_radius?: number;
      grid?: PanelGrid;
    }
  | {
      kind: "choropleth_map";
      title: string;
      /** Country identifier column (alpha-2, alpha-3, numeric, or common name; resolved via ISO-3166 lookup). */
      country: string;
      /** Column aggregated per country. Omit for `count` rows-per-country. */
      value?: string;
      agg: Aggregation;
      grid?: PanelGrid;
    }
  | {
      kind: "sankey";
      title: string;
      /** Stack multiple for multi-stage diagrams (e.g. income → account → category). */
      flows: SankeyFlow[];
      /** Optional raw-value → display-label map applied to node labels. */
      labels?: Record<string, string>;
      grid?: PanelGrid;
    };

/** One ribbon set in a Sankey panel. */
export interface SankeyFlow {
  /** Source-side categorical column. */
  from: string;
  /** Destination-side categorical column. */
  to: string;
  /** Numeric column aggregated per (from, to) pair. */
  value: string;
  /** `sum` (default), `abs_sum`, or `count` rows. */
  agg?: "sum" | "abs_sum" | "count";
  /** Optional per-flow row filter (ANDed). Same AST subset as `DashboardConfig.where`. */
  where?: AstNode[];
}

export interface DashboardConfig {
  id: string;
  name: string;
  analytic_table_id: string;
  filters: DashboardFilter[];
  panels: Panel[];
  /**
   * Optional baseline row filter, applied before the FilterBar and any
   * cross-filter click. Each element is a boolean AstNode; rows must
   * satisfy every predicate (implicit AND). See `lib/dashboard/evalWhere.ts`
   * for the supported AST subset.
   */
  where?: AstNode[];
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
