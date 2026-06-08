// Pipeline templates used when creating a new pipeline from the homepage.
//
// A template is a bundle of files (relative path -> JSON-serializable
// content) that get written under `pipelines/<slug>/` in S3.

import type { AstNode, PipelineConfig } from "@/lib/types/config";
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

// `upper(trim(col(description)))`. Reused as the description column,
// the merchant lookup input, and the category lookup input.
const CLEANED_DESCRIPTION: AstNode = {
  kind: "upper",
  input: {
    kind: "trim",
    input: { kind: "col", name: "description" },
  },
};

// `cast(col(amount), float64)`. Reused by amount and the inflow/outflow/net
// derived columns.
const AMOUNT_FLOAT: AstNode = {
  kind: "cast",
  input: { kind: "col", name: "amount" },
  to: "float64",
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
        { input_patterns: ["RENT", "PG&E", "COMCAST", "FIDO"], output: "BILLS" },
        {
          input_patterns: [
            "STARBUCKS", "CAFE", "TIM HORTONS", "RAMEN", "RA MEN",
            "SUSHI", "CHIPOTLE", "MCDONALD", "A&W", "POPEYES",
          ],
          output: "FOOD",
        },
        {
          input_patterns: ["UBER", "LYFT", "SHELL", "CHEVRON", "COMPASS"],
          output: "TRANSPORT",
        },
        { input_patterns: ["AMAZON", "TARGET", "WALMART"], output: "SHOPPING" },
        { input_patterns: ["NETFLIX", "SPOTIFY", "HULU", "STEAM"], output: "ENTERTAINMENT" },
        // Bank-internal rows. The dashboard's `where` clause excludes
        // these from the spending view by default.
        { input_patterns: ["CUSTOMER TRANSFER", "PAYMENT THANK YOU", "WITHDRAWAL"], output: "TRANSFER" },
        // INCOME outranks SHOPPING so an "AMAZON PAYROLL DEPOSIT" resolves
        // to INCOME instead of matching the earlier SHOPPING row on "AMAZON".
        { input_patterns: ["DEPOSIT", "PAYROLL", "TAX REFUND"], output: "INCOME", priority: 10 },
        { input_patterns: ["INVESTMENT"], output: "INVESTMENT" },
      ],
      children: [],
      catch_all: { output: "OTHER" },
    },
    {
      id: "merchants",
      name: "Merchants",
      match: "keyword_substring",
      case_insensitive: true,
      // Canonical names for common merchants. Anything not listed
      // falls through to the cleaned description via `coalesce` in
      // the merchant column expression below.
      rows: [
        { input_patterns: ["STARBUCKS"], output: "Starbucks" },
        { input_patterns: ["TIM HORTONS"], output: "Tim Hortons" },
        { input_patterns: ["MCDONALD"], output: "McDonald's" },
        { input_patterns: ["CHIPOTLE"], output: "Chipotle" },
        { input_patterns: ["UBER"], output: "Uber" },
        { input_patterns: ["LYFT"], output: "Lyft" },
        { input_patterns: ["AMAZON"], output: "Amazon" },
        { input_patterns: ["TARGET"], output: "Target" },
        { input_patterns: ["WALMART"], output: "Walmart" },
        { input_patterns: ["NETFLIX"], output: "Netflix" },
        { input_patterns: ["SPOTIFY"], output: "Spotify" },
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
        { name: "description", expr: CLEANED_DESCRIPTION },
        // Known merchants get a canonical name; anything else falls
        // back to the cleaned description.
        {
          name: "merchant",
          expr: {
            kind: "coalesce",
            args: [
              { kind: "lookup_ref", lookup_id: "merchants", input: CLEANED_DESCRIPTION },
              CLEANED_DESCRIPTION,
            ],
          },
        },
        { name: "amount", expr: AMOUNT_FLOAT },
        { name: "account", expr: { kind: "col", name: "account" } },
        {
          name: "category",
          expr: { kind: "lookup_ref", lookup_id: "categories", input: CLEANED_DESCRIPTION },
        },
        // Signed-amount convention: income is negative, spending positive.
        // Split into non-negative inflow/outflow plus a signed net so the
        // dashboards can sum each directly. net = inflow - outflow = -amount.
        {
          name: "inflow",
          expr: {
            kind: "if",
            cond: { kind: "lt", left: AMOUNT_FLOAT, right: { kind: "num", value: 0 } },
            then: { kind: "mul", left: AMOUNT_FLOAT, right: { kind: "num", value: -1 } },
            else: { kind: "num", value: 0 },
          },
        },
        {
          name: "outflow",
          expr: {
            kind: "if",
            cond: { kind: "gt", left: AMOUNT_FLOAT, right: { kind: "num", value: 0 } },
            then: AMOUNT_FLOAT,
            else: { kind: "num", value: 0 },
          },
        },
        {
          name: "net",
          expr: { kind: "mul", left: AMOUNT_FLOAT, right: { kind: "num", value: -1 } },
        },
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
        { name: "merchant", type: "string" },
        { name: "amount", type: "float64" },
        { name: "account", type: "string" },
        { name: "category", type: "string" },
        { name: "inflow", type: "float64" },
        { name: "outflow", type: "float64" },
        { name: "net", type: "float64" },
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
  // Drop bank-internal rows from the spending view. A separate
  // dashboard without this clause can cover income / cash-flow.
  where: [
    { kind: "ne", left: { kind: "col", name: "category" }, right: { kind: "str", value: "TRANSFER" } },
    { kind: "ne", left: { kind: "col", name: "category" }, right: { kind: "str", value: "INVESTMENT" } },
    { kind: "ne", left: { kind: "col", name: "category" }, right: { kind: "str", value: "INCOME" } },
  ],
  panels: [
    { kind: "kpi", title: "Total Spending", column: "amount", agg: "sum", format: "currency", currency: "CAD", icon: "dollar" },
    { kind: "kpi", title: "Transactions", column: "amount", agg: "count", format: "number", icon: "chart" },
    { kind: "kpi", title: "Top Category", column: "category", agg: "mode", value_column: "amount", format: "currency", currency: "CAD", icon: "shapes" },
    { kind: "doughnut", title: "By Category", group_by: "category", value: "amount", agg: "sum", grid: { aspect: "square", maxHeight: "20rem" } },
    { kind: "bar", title: "Monthly Spending", group_by: "date", value: "amount", agg: "sum", x_bin: "month", grid: { gridColumn: "span 2" } },
    { kind: "bar", title: "Top 10 Merchants", group_by: "merchant", value: "amount", agg: "sum", limit: 10, grid: { gridColumn: "1 / -1" } },
    { kind: "table", title: "Transactions", columns: ["date", "description", "merchant", "amount", "account", "category"], page_size: 10, grid: { gridColumn: "1 / -1" } },
  ],
  layout: {
    gridTemplateColumns: "repeat(auto-fit, minmax(max(18rem, calc((100% - 2rem) / 3)), 1fr))",
    gap: "1rem",
  },
} as DashboardConfig;

// Two months of seed transactions covering every category and most
// of the merchant patterns. Description values are exact substring
// matches against the lookup patterns.
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
2026-04-29,PAYROLL DEPOSIT,-3500.00,visa-1234
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
2026-05-29,PAYROLL DEPOSIT,-3500.00,visa-1234
`;

const spendingCashFlow: DashboardConfig = {
  id: "cash_flow",
  name: "Cash Flow",
  analytic_table_id: "transactions",
  filters: [
    { kind: "dropdown", column: "account", label: "Account" },
    { kind: "date_range", column: "date", label: "Date range" },
  ],
  panels: [
    {
      kind: "sankey",
      title: "Cash Flow",
      flows: [
        // Income rows carry negative amounts; abs_sum so the ribbon width is the magnitude.
        {
          from: "description",
          to: "account",
          value: "amount",
          agg: "abs_sum",
          where: [
            { kind: "eq", left: { kind: "col", name: "category" }, right: { kind: "str", value: "INCOME" } },
          ],
        },
        // Transfers need a to_account column to render properly; skip them.
        {
          from: "account",
          to: "category",
          value: "amount",
          agg: "sum",
          where: [
            { kind: "ne", left: { kind: "col", name: "category" }, right: { kind: "str", value: "INCOME" } },
            { kind: "ne", left: { kind: "col", name: "category" }, right: { kind: "str", value: "TRANSFER" } },
          ],
        },
      ],
      grid: { gridColumn: "1 / -1", maxHeight: "40rem" },
    },
    {
      kind: "table",
      title: "Income & Transfers",
      columns: ["date", "description", "amount", "account", "category"],
      page_size: 10,
      grid: { gridColumn: "1 / -1" },
    },
  ],
  layout: {
    gridTemplateColumns: "repeat(auto-fit, minmax(max(18rem, calc((100% - 2rem) / 3)), 1fr))",
    gap: "1rem",
  },
};

const spendingNetIncome: DashboardConfig = {
  id: "net_income",
  name: "Net Income",
  analytic_table_id: "transactions",
  filters: [
    { kind: "dropdown", column: "account", label: "Account" },
    { kind: "date_range", column: "date", label: "Date range" },
  ],
  // Internal transfers and contributions to investment accounts (which this
  // pipeline doesn't import) are neither income nor spending; exclude both so
  // net reflects income minus real spending.
  where: [
    { kind: "ne", left: { kind: "col", name: "category" }, right: { kind: "str", value: "TRANSFER" } },
    { kind: "ne", left: { kind: "col", name: "category" }, right: { kind: "str", value: "INVESTMENT" } },
  ],
  panels: [
    { kind: "kpi", title: "Net Savings", column: "net", agg: "sum", format: "currency", currency: "CAD", icon: "dollar", grid: { gridColumn: "span 2" } },
    { kind: "kpi", title: "Total Income", column: "inflow", agg: "sum", format: "currency", currency: "CAD", icon: "dollar", grid: { gridColumn: "span 2" } },
    { kind: "kpi", title: "Total Expenses", column: "outflow", agg: "sum", format: "currency", currency: "CAD", icon: "dollar", grid: { gridColumn: "span 2" } },
    // Primary trend: net contribution to savings each month.
    {
      kind: "line",
      title: "Net by Month",
      x: "date",
      x_bin: "month",
      y: "net",
      agg: "sum",
      grid: { gridColumn: "span 3", maxHeight: "20rem" },
    },
    // Cumulative running total: net income growth after each month.
    // Floored at the start of reliable income coverage so the curve isn't
    // dragged down by early months that have spending but no imported income.
    {
      kind: "line",
      title: "Cumulative Net Income",
      x: "date",
      x_bin: "month",
      y: "net",
      agg: "sum",
      cumulative: true,
      where: [
        { kind: "ge", left: { kind: "col", name: "date" }, right: { kind: "str", value: "2024-06-01" } },
      ],
      grid: { gridColumn: "span 3", maxHeight: "20rem" },
    },
    // No grouped/series bars in the platform, so income is a monthly bar
    // panel. Expense breakdowns live on the Spending Overview dashboard.
    {
      kind: "bar",
      title: "Income by Month",
      group_by: "date",
      value: "inflow",
      agg: "sum",
      x_bin: "month",
      grid: { gridColumn: "span 3" },
    },
    {
      kind: "bar",
      title: "Top Income Sources",
      group_by: "description",
      value: "inflow",
      agg: "sum",
      limit: 10,
      grid: { gridColumn: "span 3" },
    },
    {
      kind: "table",
      title: "Monthly Detail",
      columns: ["date", "description", "inflow", "outflow", "net", "account", "category"],
      page_size: 10,
      grid: { gridColumn: "1 / -1" },
    },
  ],
  // 6-column grid: KPIs span 2 (3 across the top), charts span 3 (2 per row,
  // half-width with no empty trailing column), table spans the full width.
  layout: {
    gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
    gap: "1rem",
  },
};

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
    description: "Personal spending pipeline with merchant + category lookups, transactions table, and overview dashboard.",
    files: {
      "pipeline.json": spendingPipeline,
      "dashboards/spending_overview.json": spendingDashboard,
      "dashboards/cash_flow.json": spendingCashFlow,
      "dashboards/net_income.json": spendingNetIncome,
    },
    rawFiles: {
      "raw/transactions/seed.csv": SPENDING_SEED_CSV,
    },
  },
};
