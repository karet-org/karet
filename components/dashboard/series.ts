// Pivot long-format rows (x, y, optional series column) into chart.js
// labels + one dataset per series value.

import { toNum } from "@/lib/dashboard/format";
import type { Row } from "./types";

export interface SeriesData {
  labels: string[];
  datasets: { name: string | null; values: (number | null)[] }[];
}

export function pivotSeries(
  rows: Row[],
  xCol: string,
  yCol: string,
  seriesCol?: string,
): SeriesData {
  const labels: string[] = [];
  const labelIndex = new Map<string, number>();
  const ensureLabel = (x: string) => {
    let i = labelIndex.get(x);
    if (i === undefined) {
      i = labels.length;
      labels.push(x);
      labelIndex.set(x, i);
    }
    return i;
  };

  if (!seriesCol) {
    const values: (number | null)[] = [];
    for (const row of rows) {
      const i = ensureLabel(String(row[xCol] ?? ""));
      values[i] = toNum(row[yCol]);
    }
    return { labels, datasets: [{ name: null, values }] };
  }

  const bySeries = new Map<string, (number | null)[]>();
  for (const row of rows) {
    const i = ensureLabel(String(row[xCol] ?? ""));
    const s = String(row[seriesCol] ?? "");
    let values = bySeries.get(s);
    if (!values) {
      values = [];
      bySeries.set(s, values);
    }
    values[i] = toNum(row[yCol]);
  }
  return {
    labels,
    datasets: [...bySeries.entries()].map(([name, values]) => ({
      name,
      values: labels.map((_, i) => values[i] ?? null),
    })),
  };
}
