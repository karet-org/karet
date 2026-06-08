// Aggregation helpers shared by doughnut, bar, and line panels.

import type { Aggregation } from "@/lib/types/dashboard";
import { toNum } from "@/lib/dashboard/format";
import type { Row } from "./types";

function toKey(v: unknown): string {
  if (v == null) return "(null)";
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

export { toKey };

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

/** Cumulative running total: each element is the sum of all prior values plus itself. */
export function runningTotal(values: number[]): number[] {
  let acc = 0;
  return values.map((v) => (acc += v));
}

/**
 * The period-key one bin before `label`, used to anchor a cumulative line at
 * zero. Returns `"Start"` when there's no meaningful prior period (no bin, or
 * an unparseable label).
 */
export function previousPeriodLabel(
  label: string,
  bin: "day" | "week" | "month" | "year" | undefined,
): string {
  switch (bin) {
    case "year": {
      const y = Number(label);
      return Number.isFinite(y) ? String(y - 1) : "Start";
    }
    case "month": {
      const m = /^(\d{4})-(\d{2})$/.exec(label);
      if (!m) return "Start";
      let y = Number(m[1]);
      let mo = Number(m[2]) - 1; // 0-based, step back one
      if (mo === 0) {
        y -= 1;
        mo = 12;
      }
      return `${y}-${String(mo).padStart(2, "0")}`;
    }
    case "day": {
      const d = new Date(`${label}T00:00:00Z`);
      if (Number.isNaN(d.getTime())) return "Start";
      d.setUTCDate(d.getUTCDate() - 1);
      return d.toISOString().slice(0, 10);
    }
    case "week": {
      const m = /^(\d{4})-W(\d{2})$/.exec(label);
      if (!m) return "Start";
      const y = Number(m[1]);
      const w = Number(m[2]);
      if (w <= 1) return `${y - 1}-W52`;
      return `${y}-W${String(w - 1).padStart(2, "0")}`;
    }
    default:
      return "Start";
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
