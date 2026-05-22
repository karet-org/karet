// Pipeline templates used when creating a new pipeline from the homepage.
//
// A template is a bundle of files (relative path -> JSON-serializable
// content) that get written under `pipelines/<slug>/` in S3.

import type { PipelineConfig } from "@/lib/types/config";
import type { DashboardConfig } from "@/lib/types/dashboard";

export type TemplateId = "blank" | "spending";

export interface Template {
  id: TemplateId;
  name: string;
  description: string;
  /** Map of path (relative to `pipelines/<slug>/`) to JSON content. */
  files: Record<string, unknown>;
  /** Plain-text files (e.g. CSV seed data) stored as-is, not JSON-stringified. */
  rawFiles?: Record<string, string>;
}

const blankPipeline: PipelineConfig = {
  version: 1,
  source_containers: [],
  lookup_mappings: [],
  mappings: [],
  analytic_tables: [],
};

const spendingPipeline: PipelineConfig = {
  version: 1,
  source_containers: [
    {
      id: "transactions_raw",
      name: "Transactions",
      path_prefix: "raw/transactions/",
      schema: [
        { name: "date", type: "string" },
        { name: "description", type: "string" },
        { name: "amount", type: "number" },
        { name: "account", type: "string" },
      ],
    },
  ],
  lookup_mappings: [
    {
      id: "categories",
      name: "Categories",
      match: "keyword_substring",
      case_insensitive: true,
      rows: [
        { input_patterns: ["STARBUCKS", "CAFE", "RAMEN", "SUSHI", "CHIPOTLE"], output: "FOOD" },
        { input_patterns: ["UBER", "LYFT", "SHELL", "CHEVRON"], output: "TRANSPORT" },
        { input_patterns: ["AMAZON", "TARGET", "WALMART"], output: "SHOPPING" },
        { input_patterns: ["NETFLIX", "SPOTIFY", "HULU"], output: "ENTERTAINMENT" },
        { input_patterns: ["RENT", "PG&E", "COMCAST"], output: "BILLS" },
      ],
      children: [],
    },
  ],
  mappings: [
    {
      id: "transactions_mapping",
      name: "Transactions Mapping",
      source_container_id: "transactions_raw",
      analytic_table_id: "transactions",
      partition_by: { column: "date", granularity: "month" },
      columns: [
        { name: "date", expr: { kind: "parse_date", input: { kind: "col", name: "date" }, format: "%Y-%m-%d" } },
        { name: "description", expr: { kind: "upper", input: { kind: "col", name: "description" } } },
        { name: "amount", expr: { kind: "cast", input: { kind: "col", name: "amount" }, to: "float64" } },
        { name: "account", expr: { kind: "col", name: "account" } },
        { name: "category", expr: { kind: "lookup_ref", lookup_id: "categories", input: { kind: "upper", input: { kind: "col", name: "description" } } } },
      ],
    },
  ],
  analytic_tables: [
    {
      id: "transactions",
      name: "Transactions",
      output_prefix: "clean/transactions/",
      schema: [
        { name: "date", type: "date" },
        { name: "description", type: "string" },
        { name: "amount", type: "float64" },
        { name: "account", type: "string" },
        { name: "category", type: "string" },
      ],
    },
  ],
};

const spendingDashboard: DashboardConfig = {
  id: "spending_overview",
  name: "Spending Overview",
  analytic_table_id: "transactions",
  filters: [
    { kind: "dropdown", column: "account", label: "Account" },
    { kind: "date_range", column: "date", label: "Date range" },
  ],
  panels: [
    { kind: "kpi", title: "Total Spending", column: "amount", agg: "sum", format: "currency", currency: "CAD", icon: "dollar" },
    { kind: "kpi", title: "Transactions", column: "amount", agg: "count", format: "number", icon: "chart" },
    { kind: "kpi", title: "Top Category", column: "category", agg: "mode", value_column: "amount", format: "currency", currency: "CAD", icon: "shapes" },
    { kind: "doughnut", title: "By Category", group_by: "category", value: "amount", agg: "sum", grid: { aspect: "square", maxHeight: "20rem" } },
    { kind: "line", title: "Monthly Trend", x: "date", x_bin: "month", y: "amount", agg: "sum", grid: { gridColumn: "span 2" } },
    { kind: "bar", title: "Top Merchants", group_by: "description", value: "amount", agg: "sum", limit: 5, grid: { gridColumn: "1 / -1" } },
    { kind: "table", title: "Transactions", columns: ["date", "description", "amount", "account", "category"], page_size: 8, grid: { gridColumn: "1 / -1" } },
  ],
  layout: { gridTemplateColumns: "repeat(auto-fit, minmax(max(18rem, calc((100% - 2rem) / 3)), 1fr))", gap: "1rem" },
} as DashboardConfig;

// Seed transactions that exercise every category in the spending lookup
// and span two months so the monthly trend line has movement. Amounts
// chosen so the doughnut and KPI tiles all read sensibly. Description
// values match the lookup's substring patterns exactly.
const SPENDING_SEED_CSV = `date,description,amount,account
2026-04-02,STARBUCKS,5.75,visa-1234
2026-04-03,UBER,18.40,visa-1234
2026-04-04,AMAZON,42.10,visa-9876
2026-04-05,NETFLIX,15.99,amex-gold
2026-04-06,RENT,1850.00,visa-1234
2026-04-07,PG&E,84.20,visa-1234
2026-04-09,SHELL,52.30,visa-9876
2026-04-10,CHIPOTLE,14.25,visa-1234
2026-04-12,TARGET,67.80,visa-9876
2026-04-14,SPOTIFY,9.99,amex-gold
2026-04-15,RAMEN,22.50,visa-1234
2026-04-17,LYFT,11.20,visa-9876
2026-04-19,WALMART,38.60,visa-1234
2026-04-22,SUSHI,46.75,amex-gold
2026-04-25,COMCAST,79.00,visa-1234
2026-04-28,CAFE,6.40,visa-1234
2026-05-01,RENT,1850.00,visa-1234
2026-05-02,PG&E,79.50,visa-1234
2026-05-03,STARBUCKS,5.75,visa-1234
2026-05-04,AMAZON,28.95,visa-9876
2026-05-05,NETFLIX,15.99,amex-gold
2026-05-07,UBER,22.10,visa-1234
2026-05-09,CHEVRON,48.80,visa-9876
2026-05-11,HULU,11.99,amex-gold
2026-05-13,CHIPOTLE,15.50,visa-1234
2026-05-15,TARGET,52.40,visa-9876
2026-05-18,RAMEN,24.25,visa-1234
2026-05-20,COMCAST,79.00,visa-1234
2026-05-22,SHELL,55.10,visa-9876
2026-05-25,WALMART,42.30,visa-1234
2026-05-28,SUSHI,51.20,amex-gold
`;

export const TEMPLATES: Record<TemplateId, Template> = {
  blank: {
    id: "blank",
    name: "Blank",
    description: "Empty pipeline - add your own sources, mappings, and tables.",
    files: { "pipeline.json": blankPipeline },
  },
  spending: {
    id: "spending",
    name: "Spending Tracker",
    description: "Personal spending pipeline with transactions table and overview dashboard.",
    files: {
      "pipeline.json": spendingPipeline,
      "dashboards/spending_overview.json": spendingDashboard,
    },
    rawFiles: {
      // Hand-curated seed CSV so a freshly-created Spending Tracker has
      // something to chart on first run. ~30 rows across two months,
      // every category in the lookup, and every account in ACCOUNTS.
      // Worker partitions by month, so we get two output partitions
      // and the line chart shows actual movement.
      "raw/transactions/seed.csv": SPENDING_SEED_CSV,
    },
  },
};
