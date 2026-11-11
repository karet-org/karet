// SQL for the Search page. A search runs over one warehouse table, exposed
// under SEARCH_ALIAS, with two extra columns: the event time as epoch seconds
// and every field joined into one lower-case string for free-text matching.

import { compileSearch, parseSearch, quoteIdent, SearchSyntaxError, type SearchColumn } from "@/lib/search/query";
import { detectTimeField, pickInterval, timeExpression, TIME_RANGES } from "@/lib/search/time";

export const SEARCH_ALIAS = "search_rows";
export const TIME_COLUMN = "_karet_time";
export const TEXT_COLUMN = "_karet_text";
export const DEFAULT_EVENTS = 50;
export const MAX_EVENTS = 200;
const MAX_SEARCH_LENGTH = 2000;

export interface SearchPlan {
  columns: SearchColumn[];
  timeField: string | null;
  /** Epoch seconds, `to` exclusive. Null for all time. */
  range: { from: number; to: number } | null;
  where: string;
  values: string[];
  /** The search condition without the time range. */
  searchWhere: string;
  usesText: boolean;
  offset: number;
  limit: number;
}

function int(raw: string | null, fallback: number): number | null {
  if (raw === null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** A number for embedding in SQL. Callers have checked it is finite. */
function num(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`not a finite number: ${n}`);
  return String(n);
}

/**
 * Read the search parameters against the table's columns: `q`, `range` (a
 * preset id) or `from` and `to` (epoch seconds), `timeField` (a column, or
 * `none`), `offset` and `limit`.
 */
export function planSearch(params: URLSearchParams, columns: SearchColumn[], now: number): SearchPlan | { error: string; position?: number | null } {
  const q = params.get("q") ?? "";
  if (q.length > MAX_SEARCH_LENGTH) return { error: `The search is longer than ${MAX_SEARCH_LENGTH} characters.` };

  const offset = int(params.get("offset"), 0);
  const limit = int(params.get("limit"), DEFAULT_EVENTS);
  if (offset === null) return { error: "offset must be a whole number of 0 or more." };
  if (limit === null || limit > MAX_EVENTS) return { error: `limit must be between 0 and ${MAX_EVENTS}.` };

  const requestedTime = params.get("timeField");
  let timeField: string | null;
  if (requestedTime === "none") timeField = null;
  else if (requestedTime) {
    if (!columns.some((c) => c.name === requestedTime)) return { error: `No column named "${requestedTime}".` };
    timeField = requestedTime;
  } else timeField = detectTimeField(columns);

  let range: SearchPlan["range"] = null;
  if (timeField) {
    const from = params.get("from");
    const to = params.get("to");
    if (from !== null || to !== null) {
      const f = Number(from);
      const t = Number(to);
      if (!Number.isFinite(f) || !Number.isFinite(t) || from === "" || to === "" || f >= t) {
        return { error: "from and to must be epoch seconds with from before to." };
      }
      range = { from: f, to: t };
    } else {
      const preset = TIME_RANGES.find((r) => r.id === (params.get("range") ?? "all"));
      if (!preset) return { error: `Unknown time range "${params.get("range")}".` };
      if (preset.seconds !== null) range = { from: now - preset.seconds, to: now };
    }
  }

  let compiled;
  try {
    compiled = compileSearch(parseSearch(q), columns, TEXT_COLUMN);
  } catch (err) {
    if (err instanceof SearchSyntaxError) return { error: err.message, position: err.position };
    throw err;
  }

  const timeCond = range ? ` AND ${TIME_COLUMN} >= ${num(range.from)} AND ${TIME_COLUMN} < ${num(range.to)}` : "";
  return {
    columns,
    timeField,
    range,
    where: `${compiled.sql}${timeCond}`,
    values: compiled.values,
    searchWhere: compiled.sql,
    usesText: compiled.usesText,
    offset,
    limit,
  };
}

/** The table with the time column added, and the text column when the search has free text. */
export function baseRelation(plan: Pick<SearchPlan, "columns" | "timeField" | "usesText">): string {
  const { columns, timeField } = plan;
  const time = timeField ? timeExpression(columns.find((c) => c.name === timeField)!) : "CAST(NULL AS DOUBLE)";
  if (!plan.usesText) return `(SELECT *, ${time} AS ${TIME_COLUMN} FROM ${SEARCH_ALIAS}) AS base`;
  const text = columns.length
    ? `lower(concat_ws(' ', ${columns.map((c) => `CAST(${quoteIdent(c.name)} AS VARCHAR)`).join(", ")}))`
    : "''";
  return `(SELECT *, ${time} AS ${TIME_COLUMN}, ${text} AS ${TEXT_COLUMN} FROM ${SEARCH_ALIAS}) AS base`;
}

export function eventsSql(plan: SearchPlan): string {
  return (
    `SELECT * ${plan.usesText ? `EXCLUDE (${TEXT_COLUMN}) ` : ""}FROM ${baseRelation(plan)}\nWHERE ${plan.where}\n` +
    `ORDER BY ${TIME_COLUMN} DESC NULLS LAST\nLIMIT ${plan.limit} OFFSET ${plan.offset}`
  );
}

export function countSql(plan: SearchPlan): string {
  return `SELECT count(*) AS total FROM ${baseRelation(plan)}\nWHERE ${plan.where}`;
}

/**
 * First and last event time in the whole table. It reads only the time
 * column, so it is cheap, and it fixes the histogram's frame before the
 * search runs.
 */
export function boundsSql(plan: SearchPlan): string {
  return `SELECT min(${TIME_COLUMN}) AS first_time, max(${TIME_COLUMN}) AS last_time FROM ${baseRelation({ ...plan, usesText: false })}`;
}

/** Latest event matching the search at any time, for an empty range. */
export function latestSql(plan: SearchPlan): string {
  return `SELECT max(${TIME_COLUMN}) AS last_time FROM ${baseRelation(plan)}\nWHERE ${plan.searchWhere}`;
}

export interface HistogramFrame {
  start: number;
  interval: number;
  buckets: number;
}

/** Bars for a range, or from the first to the last event when there is no range. */
export function histogramFrame(range: { from: number; to: number } | null, first: number | null, last: number | null): HistogramFrame | null {
  const from = range?.from ?? first;
  const to = range?.to ?? (last === null ? null : last + 1);
  if (from === null || to === null) return null;
  const interval = pickInterval(Math.max(1, to - from));
  const start = Math.floor(from / interval) * interval;
  return { start, interval, buckets: Math.max(1, Math.ceil((to - start) / interval)) };
}

/**
 * Matches per bar. Rows with no time fall in a NULL bucket, which counts
 * towards the total but has no bar.
 */
export function histogramSql(plan: SearchPlan, frame: HistogramFrame): string {
  return (
    `SELECT CAST(floor((${TIME_COLUMN} - ${num(frame.start)}) / ${num(frame.interval)}) AS BIGINT) AS bucket, count(*) AS n ` +
    `FROM ${baseRelation(plan)}\nWHERE ${plan.where}\nGROUP BY 1 ORDER BY 1`
  );
}

/** Dense counts, one per bar, from the grouped rows. */
export function fillHistogram(frame: HistogramFrame, rows: { bucket: unknown; n: unknown }[]): number[] {
  const counts = new Array<number>(frame.buckets).fill(0);
  for (const r of rows) {
    if (r.bucket === null || r.bucket === undefined) continue;
    const b = Number(r.bucket);
    if (b >= 0 && b < frame.buckets) counts[b] += Number(r.n);
  }
  return counts;
}

export const TOP_VALUES = 10;

export function fieldValuesSql(plan: SearchPlan, field: string): string {
  const id = quoteIdent(field);
  return (
    `SELECT CAST(${id} AS VARCHAR) AS value, count(*) AS n FROM ${baseRelation(plan)}\n` +
    `WHERE ${plan.where} AND ${id} IS NOT NULL\nGROUP BY 1 ORDER BY n DESC, value LIMIT ${TOP_VALUES}`
  );
}

export function fieldStatsSql(plan: SearchPlan, field: string): string {
  const id = quoteIdent(field);
  return (
    `SELECT count(*) AS total, count(${id}) AS present, approx_count_distinct(${id}) AS distinct_values ` +
    `FROM ${baseRelation(plan)}\nWHERE ${plan.where}`
  );
}
