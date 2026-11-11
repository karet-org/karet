// Time handling for the Search page: which column holds the event time, how
// to read it as epoch seconds, the preset ranges, and the histogram interval.

import { isNumericType, quoteIdent, type SearchColumn } from "./query";

export interface TimeRange {
  id: string;
  label: string;
  /** Length in seconds; null for all time. */
  seconds: number | null;
}

export const TIME_RANGES: TimeRange[] = [
  { id: "15m", label: "Last 15 minutes", seconds: 15 * 60 },
  { id: "1h", label: "Last hour", seconds: 3600 },
  { id: "4h", label: "Last 4 hours", seconds: 4 * 3600 },
  { id: "24h", label: "Last 24 hours", seconds: 24 * 3600 },
  { id: "7d", label: "Last 7 days", seconds: 7 * 86400 },
  { id: "30d", label: "Last 30 days", seconds: 30 * 86400 },
  { id: "all", label: "All time", seconds: null },
];

export const DEFAULT_RANGE = "24h";

const TIME_NAMES = ["ts", "timestamp", "@timestamp", "time", "event_time", "datetime", "created_at"];

/**
 * The column to use as the event time: the first TIMESTAMP column, else a
 * column with a usual time name, else the first DATE column. Null when the
 * table has none.
 */
export function detectTimeField(columns: SearchColumn[]): string | null {
  const ts = columns.find((c) => /^TIMESTAMP/i.test(c.type));
  if (ts) return ts.name;
  for (const name of TIME_NAMES) {
    const c = columns.find((col) => col.name.toLowerCase() === name);
    if (c && (isNumericType(c.type) || /^(VARCHAR|DATE)/i.test(c.type))) return c.name;
  }
  return columns.find((c) => /^DATE$/i.test(c.type))?.name ?? null;
}

/**
 * SQL for the column's value as epoch seconds (DOUBLE). Numbers above 1e11
 * are taken as milliseconds, since 1e11 seconds is past the year 5000. Text is
 * read as a number first, then as a timestamp.
 */
export function timeExpression(column: SearchColumn): string {
  const id = quoteIdent(column.name);
  if (/^TIMESTAMP/i.test(column.type)) return `epoch(${id})`;
  if (/^DATE$/i.test(column.type)) return `epoch(CAST(${id} AS TIMESTAMP))`;
  const seconds = (n: string) => `(CASE WHEN abs(${n}) > 1e11 THEN ${n} / 1000.0 ELSE ${n} END)`;
  if (isNumericType(column.type)) return seconds(`CAST(${id} AS DOUBLE)`);
  return `COALESCE(${seconds(`TRY_CAST(${id} AS DOUBLE)`)}, epoch(TRY_CAST(${id} AS TIMESTAMP)))`;
}

/** A number for embedding in SQL. */
function num(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`not a finite number: ${n}`);
  return String(n);
}

const TIMESTAMP_TYPES = /^(TIMESTAMP|TIMESTAMP_S|TIMESTAMP_MS|TIMESTAMP_NS|TIMESTAMP WITH TIME ZONE|TIMESTAMPTZ)$/i;

/**
 * A condition on the raw column that holds for every row whose time, as read
 * by {@link timeExpression}, is in [from, to). It may let through a few rows
 * outside the range, so the exact check on the time expression stays too.
 *
 * DuckDB pushes a comparison on a plain column into the Parquet scan, where
 * it reads that column first and skips the other columns of rows that fail.
 * It cannot do that for the time expression, so without this every search
 * reads every row. Null for text columns, which have no useful order.
 */
export function timeRangePrefilter(column: SearchColumn, from: number, to: number): string | null {
  const id = quoteIdent(column.name);
  if (/^DATE$/i.test(column.type)) {
    const day = (s: number) => `(DATE '1970-01-01' + ${num(Math.floor(s / 86400))})`;
    return `(${id} >= ${day(from)} AND ${id} <= ${day(to)})`;
  }
  if (TIMESTAMP_TYPES.test(column.type)) {
    if (/TIME ZONE|TIMESTAMPTZ/i.test(column.type)) {
      return `(${id} >= to_timestamp(${num(from)}) AND ${id} < to_timestamp(${num(to)}))`;
    }
    // Whole seconds, so the cast to TIMESTAMP_S or _MS cannot round inwards.
    const at = (s: number) => `CAST(make_timestamp(${num(s * 1e6)}) AS ${column.type.toUpperCase()})`;
    return `(${id} >= ${at(Math.floor(from))} AND ${id} <= ${at(Math.ceil(to))})`;
  }
  if (isNumericType(column.type)) {
    // Seconds, or milliseconds as timeExpression reads numbers above 1e11.
    return (
      `((${id} >= ${num(from)} AND ${id} < ${num(to)}) OR ` +
      `(${id} >= ${num(from * 1000)} AND ${id} < ${num(to * 1000)}))`
    );
  }
  return null;
}

const INTERVALS = [
  1, 5, 10, 30, 60, 5 * 60, 10 * 60, 30 * 60, 3600, 3 * 3600, 6 * 3600, 12 * 3600, 86400, 7 * 86400, 30 * 86400,
  365 * 86400,
];

/** The smallest interval that splits `span` seconds into at most `maxBuckets` bars. */
export function pickInterval(span: number, maxBuckets = 60): number {
  return INTERVALS.find((s) => span / s <= maxBuckets) ?? INTERVALS[INTERVALS.length - 1];
}

export function intervalLabel(seconds: number): string {
  const units: [number, string][] = [
    [365 * 86400, "year"],
    [30 * 86400, "30 days"],
    [7 * 86400, "week"],
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
    [1, "second"],
  ];
  for (const [size, name] of units) {
    if (seconds >= size && seconds % size === 0) {
      const n = seconds / size;
      if (name === "30 days") return "30 days";
      return n === 1 ? name : `${n} ${name}s`;
    }
  }
  return `${seconds} seconds`;
}
