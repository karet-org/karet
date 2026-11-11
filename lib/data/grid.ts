// Helpers for the Data page's result grid: cell text, sorting and CSV export.

import { formatLabel } from "@/lib/dashboard/format";

export type Row = Record<string, unknown>;
export type SortDir = "asc" | "desc";
export interface Sort {
  column: string;
  dir: SortDir;
}

/** Text for a cell, or null for SQL NULL. */
export function cellText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object") return JSON.stringify(v);
  return formatLabel(String(v));
}

/** The full value, for the cell viewer: objects are pretty-printed. */
export function cellDetail(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object") return JSON.stringify(v, null, 2);
  return String(v);
}

const NUMERIC = /^(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|FLOAT|DOUBLE|DECIMAL|REAL|int64|float64|number)/i;

/** Whether a column should be right-aligned. */
export function isNumericColumn(type: string | undefined, sample: unknown): boolean {
  if (type) return NUMERIC.test(type);
  return typeof sample === "number";
}

/** Column header click: unsorted, then ascending, then descending, then unsorted. */
export function nextSort(current: Sort | null, column: string): Sort | null {
  if (!current || current.column !== column) return { column, dir: "asc" };
  if (current.dir === "asc") return { column, dir: "desc" };
  return null;
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  // Nulls last in both directions, as the server sorts them.
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

/** Sort rows in the browser, for SQL results that are already in memory. */
export function sortRows(rows: Row[], sort: Sort | null): Row[] {
  if (!sort) return rows;
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((x, y) => {
    const a = x[sort.column];
    const b = y[sort.column];
    if (a === null || a === undefined || b === null || b === undefined) return compare(a, b);
    return sign * compare(a, b);
  });
}

function csvField(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** RFC 4180 CSV with a header row. Values are written as stored, not shortened. */
export function toCsv(columns: string[], rows: Row[]): string {
  const lines = [columns.map(csvField).join(",")];
  for (const row of rows) lines.push(columns.map((c) => csvField(row[c])).join(","));
  return lines.join("\r\n") + "\r\n";
}

/** Offer `csv` as a file download. */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
