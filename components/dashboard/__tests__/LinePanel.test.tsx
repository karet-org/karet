// LinePanel: verifies the per-panel `where` floor is applied to rows.
//
// Chart.js is mocked (jsdom has no canvas), so we assert via the data the
// mocked Line receives rather than pixels.

import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import type { ColumnSchema } from "@/lib/types/config";
import type { Panel } from "@/lib/types/dashboard";
import type { Row } from "../types";

// Capture the data prop handed to the Line chart.
let lastData: { labels: string[]; datasets: { data: number[] }[] } | null = null;
vi.mock("react-chartjs-2", () => ({
  Line: (props: { data: typeof lastData }) => {
    lastData = props.data;
    return null;
  },
}));

import LinePanel from "../LinePanel";

const SCHEMA: ColumnSchema[] = [
  { name: "date", type: "date" },
  { name: "net", type: "float64" },
];

const ROWS: Row[] = [
  { date: "2024-01-01", net: -100 },
  { date: "2024-02-01", net: -50 },
  { date: "2024-06-01", net: 300 },
  { date: "2024-07-01", net: 200 },
];

beforeEach(() => {
  lastData = null;
  cleanup();
});

describe("LinePanel per-panel where", () => {
  it("floors rows by a date `where` before bucketing", () => {
    const config: Panel = {
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
    };
    render(<LinePanel config={config} rows={ROWS} schema={SCHEMA} />);
    // Only the two post-floor months survive; the curve is anchored at 0 on
    // the prior month, then runs 300 -> 500.
    expect(lastData?.labels).toEqual(["2024-05", "2024-06", "2024-07"]);
    expect(lastData?.datasets[0].data).toEqual([0, 300, 500]);
  });

  it("includes all rows when no `where` is set", () => {
    const config: Panel = {
      kind: "line",
      title: "Net by Month",
      x: "date",
      x_bin: "month",
      y: "net",
      agg: "sum",
    };
    render(<LinePanel config={config} rows={ROWS} schema={SCHEMA} />);
    expect(lastData?.labels).toEqual(["2024-01", "2024-02", "2024-06", "2024-07"]);
    expect(lastData?.datasets[0].data).toEqual([-100, -50, 300, 200]);
  });
});
