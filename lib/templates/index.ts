// Pipeline templates used when creating a new pipeline from the homepage.
//
// A template is a bundle of files (relative path -> JSON-serializable
// content) that get written under `pipelines/<slug>/` in S3.

import type { AstNode, PipelineConfig } from "@/lib/types/config";

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
      path_prefix: "transactions/",
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
      ],
    },
  ],
  analytic_tables: [
    {
      id: "transactions",
      name: "Transactions",
      output_prefix: "transactions/",
      schema: [
        { name: "date", type: "date" },
        { name: "description", type: "string" },
        { name: "merchant", type: "string" },
        { name: "amount", type: "float64" },
        { name: "account", type: "string" },
        { name: "category", type: "string" },
      ],
    },
  ],
};

const spendingDashboardYaml = `version: 2
id: spending_overview
name: Spending Overview

filters:
  - name: account
    kind: dropdown
    label: Account
    options_sql: SELECT DISTINCT account FROM transactions ORDER BY 1
  - name: period
    kind: date_range
    label: Date range

panels:
  - kind: kpi
    title: Total Spending
    query: |
      SELECT sum(amount) AS total FROM transactions
      WHERE category NOT IN ('TRANSFER', 'INVESTMENT', 'INCOME')
        AND account = coalesce($account, account)
        AND date BETWEEN coalesce($period_from, DATE '0001-01-01')
                     AND coalesce($period_to, DATE '9999-12-31')
    value: total
    format: currency
    currency: CAD
    icon: dollar

  - kind: kpi
    title: Transactions
    query: |
      SELECT count(*) AS n FROM transactions
      WHERE category NOT IN ('TRANSFER', 'INVESTMENT', 'INCOME')
        AND account = coalesce($account, account)
        AND date BETWEEN coalesce($period_from, DATE '0001-01-01')
                     AND coalesce($period_to, DATE '9999-12-31')
    value: n
    icon: chart

  - kind: kpi
    title: Top Category
    query: |
      SELECT category || ' (' || round(sum(amount))::VARCHAR || ')' AS top
      FROM transactions
      WHERE category NOT IN ('TRANSFER', 'INVESTMENT', 'INCOME')
        AND account = coalesce($account, account)
        AND date BETWEEN coalesce($period_from, DATE '0001-01-01')
                     AND coalesce($period_to, DATE '9999-12-31')
      GROUP BY category ORDER BY sum(amount) DESC LIMIT 1
    value: top
    format: raw
    icon: shapes

  - kind: doughnut
    title: By Category
    query: |
      SELECT category, sum(amount) AS total FROM transactions
      WHERE category NOT IN ('TRANSFER', 'INVESTMENT', 'INCOME')
        AND account = coalesce($account, account)
        AND date BETWEEN coalesce($period_from, DATE '0001-01-01')
                     AND coalesce($period_to, DATE '9999-12-31')
      GROUP BY 1 ORDER BY 2 DESC
    label: category
    value: total
    grid: { aspect: square, maxHeight: 20rem }

  - kind: bar
    title: Monthly Spending
    query: |
      SELECT strftime(date, '%Y-%m') AS month, sum(amount) AS total
      FROM transactions
      WHERE category NOT IN ('TRANSFER', 'INVESTMENT', 'INCOME')
        AND account = coalesce($account, account)
        AND date BETWEEN coalesce($period_from, DATE '0001-01-01')
                     AND coalesce($period_to, DATE '9999-12-31')
      GROUP BY 1 ORDER BY 1
    x: month
    y: total
    grid: { span: 2 }

  - kind: bar
    title: Top 10 Merchants
    query: |
      SELECT merchant, sum(amount) AS total FROM transactions
      WHERE category NOT IN ('TRANSFER', 'INVESTMENT', 'INCOME')
        AND account = coalesce($account, account)
        AND date BETWEEN coalesce($period_from, DATE '0001-01-01')
                     AND coalesce($period_to, DATE '9999-12-31')
      GROUP BY 1 ORDER BY 2 DESC LIMIT 10
    x: merchant
    y: total
    horizontal: true
    grid: { span: full }

  - kind: table
    title: Transactions
    query: |
      SELECT date, description, merchant, amount, account, category
      FROM transactions
      WHERE category NOT IN ('TRANSFER', 'INVESTMENT', 'INCOME')
        AND account = coalesce($account, account)
        AND date BETWEEN coalesce($period_from, DATE '0001-01-01')
                     AND coalesce($period_to, DATE '9999-12-31')
      ORDER BY date DESC
    page_size: 10
    grid: { span: full }

layout:
  columns: 3
  gap: 1rem
`;

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

const cashFlowYaml = `version: 2
id: cash_flow
name: Cash Flow

filters:
  - name: account
    kind: dropdown
    label: Account
    options_sql: SELECT DISTINCT account FROM transactions ORDER BY 1
  - name: period
    kind: date_range
    label: Date range

panels:
  - kind: sankey
    title: Cash Flow
    query: |
      SELECT description AS src, account AS dst, sum(abs(amount)) AS total
      FROM transactions
      WHERE category = 'INCOME' AND account = coalesce($account, account)
        AND date BETWEEN coalesce($period_from, DATE '0001-01-01')
                     AND coalesce($period_to, DATE '9999-12-31')
      GROUP BY 1, 2
      UNION ALL
      SELECT account AS src, category AS dst, sum(abs(amount)) AS total
      FROM transactions
      WHERE category NOT IN ('INCOME', 'TRANSFER', 'INVESTMENT') AND account = coalesce($account, account)
        AND date BETWEEN coalesce($period_from, DATE '0001-01-01')
                     AND coalesce($period_to, DATE '9999-12-31')
      GROUP BY 1, 2
    source: src
    target: dst
    value: total
    grid: { span: full, maxHeight: 40rem }

  - kind: table
    title: Transactions
    query: |
      SELECT date, description, amount, account, category FROM transactions
      WHERE account = coalesce($account, account)
        AND date BETWEEN coalesce($period_from, DATE '0001-01-01')
                     AND coalesce($period_to, DATE '9999-12-31')
      ORDER BY date DESC
    page_size: 10
    grid: { span: full }

layout:
  columns: 1
  gap: 1rem
`;

const netIncomeYaml = `version: 2
id: net_income
name: Net Income

filters:
  - name: account
    kind: dropdown
    label: Account
    options_sql: SELECT DISTINCT account FROM transactions ORDER BY 1
  - name: period
    kind: date_range
    label: Date range

panels:
  - kind: kpi
    title: Net Savings
    query: |
      SELECT sum(-amount) AS net FROM transactions WHERE category NOT IN ('TRANSFER', 'INVESTMENT')
        AND account = coalesce($account, account)
        AND date BETWEEN coalesce($period_from, DATE '0001-01-01')
                     AND coalesce($period_to, DATE '9999-12-31')
    value: net
    format: currency
    currency: CAD
    icon: dollar
    grid: { span: 2 }

  - kind: kpi
    title: Total Income
    query: |
      SELECT sum(if(amount < 0, -amount, 0)) AS total FROM transactions WHERE category NOT IN ('TRANSFER', 'INVESTMENT')
        AND account = coalesce($account, account)
        AND date BETWEEN coalesce($period_from, DATE '0001-01-01')
                     AND coalesce($period_to, DATE '9999-12-31')
    value: total
    format: currency
    currency: CAD
    icon: dollar
    grid: { span: 2 }

  - kind: kpi
    title: Total Expenses
    query: |
      SELECT sum(if(amount > 0, amount, 0)) AS total FROM transactions WHERE category NOT IN ('TRANSFER', 'INVESTMENT')
        AND account = coalesce($account, account)
        AND date BETWEEN coalesce($period_from, DATE '0001-01-01')
                     AND coalesce($period_to, DATE '9999-12-31')
    value: total
    format: currency
    currency: CAD
    icon: dollar
    grid: { span: 2 }

  - kind: line
    title: Net by Month
    query: |
      SELECT strftime(date, '%Y-%m') AS month, sum(-amount) AS net
      FROM transactions WHERE category NOT IN ('TRANSFER', 'INVESTMENT')
        AND account = coalesce($account, account)
        AND date BETWEEN coalesce($period_from, DATE '0001-01-01')
                     AND coalesce($period_to, DATE '9999-12-31')
      GROUP BY 1 ORDER BY 1
    x: month
    y: net
    grid: { span: 3, maxHeight: 20rem }

  - kind: line
    title: Cumulative Net Income
    query: |
      SELECT month, sum(net) OVER (ORDER BY month) AS cumulative
      FROM (
        SELECT strftime(date, '%Y-%m') AS month, sum(-amount) AS net
        FROM transactions WHERE category NOT IN ('TRANSFER', 'INVESTMENT')
        AND account = coalesce($account, account)
        AND date BETWEEN coalesce($period_from, DATE '0001-01-01')
                     AND coalesce($period_to, DATE '9999-12-31')
        GROUP BY 1
      ) ORDER BY month
    x: month
    y: cumulative
    grid: { span: 3, maxHeight: 20rem }

  - kind: bar
    title: Income by Month
    query: |
      SELECT strftime(date, '%Y-%m') AS month,
             sum(if(amount < 0, -amount, 0)) AS income
      FROM transactions WHERE category NOT IN ('TRANSFER', 'INVESTMENT')
        AND account = coalesce($account, account)
        AND date BETWEEN coalesce($period_from, DATE '0001-01-01')
                     AND coalesce($period_to, DATE '9999-12-31')
      GROUP BY 1 ORDER BY 1
    x: month
    y: income
    grid: { span: 3 }

  - kind: bar
    title: Top Income Sources
    query: |
      SELECT description, sum(-amount) AS income FROM transactions
      WHERE amount < 0 AND category NOT IN ('TRANSFER', 'INVESTMENT')
        AND account = coalesce($account, account)
        AND date BETWEEN coalesce($period_from, DATE '0001-01-01')
                     AND coalesce($period_to, DATE '9999-12-31')
      GROUP BY 1 ORDER BY 2 DESC LIMIT 10
    x: description
    y: income
    horizontal: true
    grid: { span: 3 }

  - kind: table
    title: Monthly Detail
    query: |
      SELECT date, description, amount, account, category FROM transactions
      WHERE category NOT IN ('TRANSFER', 'INVESTMENT')
        AND account = coalesce($account, account)
        AND date BETWEEN coalesce($period_from, DATE '0001-01-01')
                     AND coalesce($period_to, DATE '9999-12-31')
      ORDER BY date DESC
    page_size: 10
    grid: { span: full }

layout:
  columns: 6
  gap: 1rem
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
    description: "Personal spending pipeline with merchant + category lookups, transactions table, and overview dashboard.",
    files: {
      "pipeline.json": spendingPipeline,
    },
    rawFiles: {
      "transactions/seed.csv": SPENDING_SEED_CSV,
      "dashboards/spending_overview.yaml": spendingDashboardYaml,
      "dashboards/cash_flow.yaml": cashFlowYaml,
      "dashboards/net_income.yaml": netIncomeYaml,
    },
  },
};
