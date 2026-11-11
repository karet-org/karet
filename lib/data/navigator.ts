// Filtering and labels for the Data page navigator.

import type { SavedQuery } from "@/lib/types/query";
import type { TableInfo } from "@/components/data/types";

export interface NavigatorMatch {
  /** Tables to show, with the columns to show under each. */
  tables: { table: TableInfo; columns: TableInfo["schema"]; matchedColumns: boolean }[];
  queries: SavedQuery[];
}

/**
 * Tables, columns and saved queries whose names contain `filter`, ignoring
 * case. A table is shown when its name or any of its columns matches; when
 * only columns match, just those columns are listed.
 */
export function filterNavigator(
  tables: TableInfo[],
  queries: SavedQuery[],
  filter: string,
): NavigatorMatch {
  const q = filter.trim().toLowerCase();
  if (!q) {
    return {
      tables: tables.map((table) => ({ table, columns: table.schema, matchedColumns: false })),
      queries,
    };
  }
  const hit = (s: string) => s.toLowerCase().includes(q);
  const out: NavigatorMatch["tables"] = [];
  for (const table of tables) {
    if (hit(table.name) || hit(table.slug)) {
      out.push({ table, columns: table.schema, matchedColumns: false });
      continue;
    }
    const columns = table.schema.filter((c) => hit(c.name));
    if (columns.length > 0) out.push({ table, columns, matchedColumns: true });
  }
  return { tables: out, queries: queries.filter((s) => hit(s.name) || hit(s.id)) };
}

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

/** `2.9M rows`, `1 row`, or null when unknown. */
export function rowsLabel(n: number | null): string | null {
  if (n === null) return null;
  return `${n < 1000 ? n : compact.format(n)} row${n === 1 ? "" : "s"}`;
}

/** `just now`, `5 min ago`, `3 h ago`, `2 d ago`, from an ISO time. */
export function ageLabel(iso: string | null, now = Date.now()): string | null {
  if (!iso) return null;
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (Number.isNaN(s)) return null;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export const NAV_MIN_WIDTH = 180;
export const NAV_MAX_WIDTH = 440;
export const NAV_DEFAULT_WIDTH = 224;

export function clampNavWidth(px: number): number {
  return Math.round(Math.min(NAV_MAX_WIDTH, Math.max(NAV_MIN_WIDTH, px)));
}
