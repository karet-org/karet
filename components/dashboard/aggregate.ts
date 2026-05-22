// Aggregation helpers shared by doughnut, bar, and line panels.

import type { Aggregation } from "@/lib/types/dashboard";
import { toNum } from "@/lib/dashboard/format";
import type { Row } from "./types";

function toKey(v: unknown): string {
  if (v == null) return "(null)";
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

/** Apply the declared aggregation to a list of values. */
export function aggregateValues(values: number[], agg: Aggregation): number {
  if (values.length === 0) return 0;
  switch (agg) {
    case "sum":
      return values.reduce((a, b) => a + b, 0);
    case "count":
      return values.length;
    case "avg":
      return values.reduce((a, b) => a + b, 0) / values.length;
    case "min":
      // `Math.min(...values)` spreads the array into function arguments;
      // browsers cap that at ~64-256k args and throw on larger sets.
      // Reduce folds safely over any length.
      return values.reduce((a, b) => (a < b ? a : b));
    case "max":
      return values.reduce((a, b) => (a > b ? a : b));
  }
}

/** Group rows by a column and aggregate a numeric column per group. */
export function groupAndAggregate(
  rows: Row[],
  groupBy: string,
  valueCol: string,
  agg: Aggregation,
): Map<string, number> {
  const buckets = new Map<string, number[]>();
  for (const row of rows) {
    const key = toKey(row[groupBy]);
    const num = toNum(row[valueCol]) ?? 0;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(num);
    else buckets.set(key, [num]);
  }
  const out = new Map<string, number>();
  for (const [k, vs] of buckets) out.set(k, aggregateValues(vs, agg));
  return out;
}

/**
 * Bin a date-ish value to a period key. `day` produces `YYYY-MM-DD`,
 * `week` produces `YYYY-Www`, `month` produces `YYYY-MM`, `year` produces
 * `YYYY`. Non-dates fall through to their string form.
 */
export function binDate(
  v: unknown,
  bin: "day" | "week" | "month" | "year" | undefined,
): string {
  const d = coerceDate(v);
  if (!d) return toKey(v);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  switch (bin) {
    case "year":
      return `${y}`;
    case "month":
      return `${y}-${m}`;
    case "week": {
      // ISO week number, quick computation.
      const tmp = new Date(Date.UTC(y, d.getUTCMonth(), d.getUTCDate()));
      const dayNum = tmp.getUTCDay() || 7;
      tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
      const week = Math.ceil(
        ((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
      );
      return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
    }
    case "day":
    default:
      return `${y}-${m}-${day}`;
  }
}

function coerceDate(v: unknown): Date | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === "string") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === "number") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}
