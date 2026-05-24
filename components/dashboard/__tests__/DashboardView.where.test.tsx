// Integration: DashboardView honors `config.where` before any user filter.
//
// Builds a minimal config with a `where` that excludes `category` values
// of TRANSFER and INVESTMENT, renders the dashboard, and checks both:
//   1. Visible table rows are restricted to the surviving categories.
//   2. The category dropdown's option list is also restricted (excluded
//      categories should not appear as user-selectable options).
//
// We use a `table` panel for assertion since it makes individual rows
// directly inspectable in the DOM. Charts are mocked to no-ops because
// jsdom lacks a canvas.

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, cleanup, within } from "@testing-library/react";
import type { ColumnSchema } from "@/lib/types/config";
import type { DashboardConfig } from "@/lib/types/dashboard";
import DashboardView from "../DashboardView";
import type { Row } from "../types";

vi.mock("react-chartjs-2", () => {
  const stub = () => null;
  return { Doughnut: stub, Line: stub, Bar: stub };
});

const SCHEMA: ColumnSchema[] = [
  { name: "date", type: "date" },
  { name: "description", type: "string" },
  { name: "amount", type: "float64" },
  { name: "category", type: "string" },
];

const ROWS: Row[] = [
  { date: "2025-01-01", description: "STARBUCKS", amount: 5, category: "FOOD" },
  { date: "2025-01-02", description: "WIRE OUT", amount: 1000, category: "TRANSFER" },
  { date: "2025-01-03", description: "WEALTHSIMPLE", amount: 500, category: "INVESTMENT" },
  { date: "2025-01-04", description: "WALMART", amount: 25, category: "SHOPPING" },
  // pre-recategorization row -- where clause is forgiving on null
  { date: "2025-01-05", description: "MYSTERY", amount: 9, category: null },
];

function makeConfig(where: DashboardConfig["where"]): DashboardConfig {
  return {
    id: "t",
    name: "Test",
    analytic_table_id: "transactions",
    where,
    filters: [
      { kind: "dropdown", column: "category", label: "Category" },
    ],
    panels: [
      {
        kind: "table",
        title: "Rows",
        columns: ["description", "category"],
        page_size: 100,
      },
    ],
  };
}

describe("DashboardView — config.where", () => {
  it("with no where, renders all rows", () => {
    const { container } = render(
      React.createElement(DashboardView, {
        config: makeConfig(undefined),
        rows: ROWS,
        schema: SCHEMA,
      }),
    );
    const text = container.textContent ?? "";
    expect(text).toContain("STARBUCKS");
    expect(text).toContain("WIRE OUT");
    expect(text).toContain("WEALTHSIMPLE");
    expect(text).toContain("WALMART");
    expect(text).toContain("MYSTERY");
    cleanup();
  });

  it("excludes rows whose category matches the where clause", () => {
    const { container } = render(
      React.createElement(DashboardView, {
        config: makeConfig([
          { kind: "ne", left: { kind: "col", name: "category" }, right: { kind: "str", value: "TRANSFER" } },
          { kind: "ne", left: { kind: "col", name: "category" }, right: { kind: "str", value: "INVESTMENT" } },
        ]),
        rows: ROWS,
        schema: SCHEMA,
      }),
    );
    const text = container.textContent ?? "";
    expect(text).toContain("STARBUCKS");
    expect(text).toContain("WALMART");
    expect(text).toContain("MYSTERY"); // null category survives `ne`
    expect(text).not.toContain("WIRE OUT");
    expect(text).not.toContain("WEALTHSIMPLE");
    cleanup();
  });

  it("restricts dropdown filter options to where-filtered values", () => {
    const { getByTestId } = render(
      React.createElement(DashboardView, {
        config: makeConfig([
          { kind: "ne", left: { kind: "col", name: "category" }, right: { kind: "str", value: "TRANSFER" } },
          { kind: "ne", left: { kind: "col", name: "category" }, right: { kind: "str", value: "INVESTMENT" } },
        ]),
        rows: ROWS,
        schema: SCHEMA,
      }),
    );
    const filterBar = getByTestId("filter-bar");
    const select = within(filterBar).getByRole("combobox") as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);

    // The "All" sentinel is "".
    expect(optionValues).toContain("");
    expect(optionValues).toContain("FOOD");
    expect(optionValues).toContain("SHOPPING");
    expect(optionValues).not.toContain("TRANSFER");
    expect(optionValues).not.toContain("INVESTMENT");
    cleanup();
  });
});
