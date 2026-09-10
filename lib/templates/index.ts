// Pipeline templates for new-pipeline creation: bundles of files (relative
// path -> content) written under `pipelines/<slug>/` in S3.

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
  name: "Blank",
  source_containers: [],
  dimensions: [],
  mappings: [],
  analytic_tables: [],
};

// Reused as the description column and as both lookup inputs.
const CLEANED_DESCRIPTION: AstNode = {
  kind: "upper",
  input: {
    kind: "trim",
    input: { kind: "col", name: "description" },
  },
};

const PARSED_DATE: AstNode = {
  kind: "parse_date",
  input: { kind: "col", name: "date" },
  format: "%Y-%m-%d",
};

const AMOUNT_FLOAT: AstNode = {
  kind: "cast",
  input: { kind: "col", name: "amount" },
  to: "float64",
};

const spendingPipeline: PipelineConfig = {
  version: 1,
  name: "Spending Tracker",
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
  dimensions: [
    {
      id: "categories",
      name: "Categories",
      match: "keyword_substring",
      case_insensitive: true,
      on_miss: { literal: "OTHER" },
      rows: {
        values: ["category"],
        rows: [
        { patterns: ["RENT", "PG&E", "COMCAST", "FIDO"], values: ["BILLS"] },
        {
          patterns: [
            "STARBUCKS", "CAFE", "TIM HORTONS", "RAMEN", "RA MEN",
            "SUSHI", "CHIPOTLE", "MCDONALD", "A&W", "POPEYES",
          ],
          values: ["FOOD"],
        },
        {
          patterns: ["UBER", "LYFT", "SHELL", "CHEVRON", "COMPASS"],
          values: ["TRANSPORT"],
        },
        { patterns: ["AMAZON", "TARGET", "WALMART"], values: ["SHOPPING"] },
        { patterns: ["NETFLIX", "SPOTIFY", "HULU", "STEAM"], values: ["ENTERTAINMENT"] },
        // Bank-internal rows; the dashboard's `where` clause excludes these.
        { patterns: ["CUSTOMER TRANSFER", "PAYMENT THANK YOU", "WITHDRAWAL"], values: ["TRANSFER"] },
        // INCOME outranks SHOPPING so "AMAZON PAYROLL DEPOSIT" isn't SHOPPING.
        { patterns: ["DEPOSIT", "PAYROLL", "TAX REFUND"], values: ["INCOME"], priority: 10 },
        { patterns: ["INVESTMENT"], values: ["INVESTMENT"] },
        ],
      },
    },
    {
      id: "merchants",
      name: "Merchants",
      match: "keyword_substring",
      case_insensitive: true,
      // Unlisted merchants fall through to the cleaned description via the
      // `coalesce` in the merchant column below.
      rows: {
        values: ["merchant"],
        rows: [
        { patterns: ["STARBUCKS"], values: ["Starbucks"] },
        { patterns: ["TIM HORTONS"], values: ["Tim Hortons"] },
        { patterns: ["MCDONALD"], values: ["McDonald's"] },
        { patterns: ["CHIPOTLE"], values: ["Chipotle"] },
        { patterns: ["UBER"], values: ["Uber"] },
        { patterns: ["LYFT"], values: ["Lyft"] },
        { patterns: ["AMAZON"], values: ["Amazon"] },
        { patterns: ["TARGET"], values: ["Target"] },
        { patterns: ["WALMART"], values: ["Walmart"] },
        { patterns: ["NETFLIX"], values: ["Netflix"] },
        { patterns: ["SPOTIFY"], values: ["Spotify"] },
        ],
      },
    },
  ],
  mappings: [
    {
      id: "transactions_mapping",
      name: "Transactions Mapping",
      source_container_id: "transactions_raw",
      analytic_table_id: "transactions",
      columns: [
        { name: "date", expr: PARSED_DATE },
        { name: "description", expr: CLEANED_DESCRIPTION },
        {
          name: "merchant",
          expr: {
            kind: "coalesce",
            args: [
              { kind: "dim_ref", dim_id: "merchants", input: CLEANED_DESCRIPTION },
              CLEANED_DESCRIPTION,
            ],
          },
        },
        { name: "amount", expr: AMOUNT_FLOAT },
        { name: "account", expr: { kind: "col", name: "account" } },
        {
          name: "category",
          expr: { kind: "dim_ref", dim_id: "categories", input: CLEANED_DESCRIPTION },
        },
        { name: "year", expr: { kind: "year", input: PARSED_DATE } },
        { name: "month", expr: { kind: "month", input: PARSED_DATE } },
      ],
    },
  ],
  analytic_tables: [
    {
      id: "transactions",
      name: "Transactions",
      schema: [
        { name: "date", type: "date" },
        { name: "description", type: "string" },
        { name: "merchant", type: "string" },
        { name: "amount", type: "float64" },
        { name: "account", type: "string" },
        { name: "category", type: "string" },
        { name: "year", type: "int64" },
        { name: "month", type: "int64" },
      ],
      partition_keys: ["year", "month"],
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
  - name: category
    kind: dropdown
    label: Category
    options_sql: |
      SELECT DISTINCT category FROM transactions
      WHERE category NOT IN ('TRANSFER', 'INVESTMENT', 'INCOME') ORDER BY 1
  - name: merchant
    kind: dropdown
    label: Merchant
    options_sql: SELECT DISTINCT merchant FROM transactions ORDER BY 1
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
        AND category = coalesce($category, category)
        AND merchant = coalesce($merchant, merchant)
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
        AND category = coalesce($category, category)
        AND merchant = coalesce($merchant, merchant)
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
        AND category = coalesce($category, category)
        AND merchant = coalesce($merchant, merchant)
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
        AND category = coalesce($category, category)
        AND merchant = coalesce($merchant, merchant)
        AND date BETWEEN coalesce($period_from, DATE '0001-01-01')
                     AND coalesce($period_to, DATE '9999-12-31')
      GROUP BY 1 ORDER BY 2 DESC
    label: category
    value: total
    emit: { param: category }
    grid: { aspect: square, maxHeight: 20rem }

  - kind: bar
    title: Monthly Spending
    query: |
      SELECT strftime(date, '%Y-%m') AS month, sum(amount) AS total
      FROM transactions
      WHERE category NOT IN ('TRANSFER', 'INVESTMENT', 'INCOME')
        AND account = coalesce($account, account)
        AND category = coalesce($category, category)
        AND merchant = coalesce($merchant, merchant)
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
        AND category = coalesce($category, category)
        AND merchant = coalesce($merchant, merchant)
        AND date BETWEEN coalesce($period_from, DATE '0001-01-01')
                     AND coalesce($period_to, DATE '9999-12-31')
      GROUP BY 1 ORDER BY 2 DESC LIMIT 10
    x: merchant
    y: total
    horizontal: true
    emit: { param: merchant }
    grid: { span: full }

  - kind: table
    title: Transactions
    query: |
      SELECT date, description, merchant, amount, account, category
      FROM transactions
      WHERE category NOT IN ('TRANSFER', 'INVESTMENT', 'INCOME')
        AND account = coalesce($account, account)
        AND category = coalesce($category, category)
        AND merchant = coalesce($merchant, merchant)
        AND date BETWEEN coalesce($period_from, DATE '0001-01-01')
                     AND coalesce($period_to, DATE '9999-12-31')
      ORDER BY date DESC
    page_size: 10
    grid: { span: full }

layout:
  columns: 3
  gap: 1rem
`;

// Two months of seed transactions; descriptions are exact substring matches
// against the lookup patterns above.
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
      SELECT merchant AS src, account AS dst, sum(abs(amount)) AS total,
             0 AS src_layer, 1 AS dst_layer
      FROM transactions
      WHERE category = 'INCOME' AND account = coalesce($account, account)
        AND date BETWEEN coalesce($period_from, DATE '0001-01-01')
                     AND coalesce($period_to, DATE '9999-12-31')
      GROUP BY 1, 2
      UNION ALL
      SELECT account AS src, category AS dst, sum(abs(amount)) AS total,
             1 AS src_layer, 2 AS dst_layer
      FROM transactions
      WHERE category NOT IN ('INCOME', 'TRANSFER', 'INVESTMENT') AND account = coalesce($account, account)
        AND date BETWEEN coalesce($period_from, DATE '0001-01-01')
                     AND coalesce($period_to, DATE '9999-12-31')
      GROUP BY 1, 2
    source: src
    target: dst
    value: total
    source_layer: src_layer
    target_layer: dst_layer
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
    description: "Personal spending pipeline with merchant + category dimensions, transactions table, and overview dashboard.",
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
