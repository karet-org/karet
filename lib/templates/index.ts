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
        { name: "amount", expr: { kind: "cast", input: { kind: "mul", left: { kind: "col", name: "amount" }, right: { kind: "num", value: 100 } }, to: "int64" } },
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
        { name: "amount", type: "int64" },
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
    { kind: "summary", title: "Summary", columns: ["amount", "category"], grid: { gridColumn: "1 / -1" } },
    { kind: "doughnut", title: "By Category", group_by: "category", value: "amount", agg: "sum" },
    { kind: "bar", title: "Top Merchants", group_by: "description", value: "amount", agg: "sum", limit: 5 },
    { kind: "line", title: "Monthly Trend", x: "date", x_bin: "month", y: "amount", agg: "sum" },
    { kind: "table", title: "Transactions", columns: ["date", "description", "amount", "account", "category"], page_size: 8, grid: { gridColumn: "1 / -1" } },
  ],
  layout: { gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" },
} as DashboardConfig;

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
  },
};
