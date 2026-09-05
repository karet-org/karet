"use client";

// FilterBar: renders one control per DashboardFilter and reports filter
// state to the parent via `onChange`. Dropdown filters derive their option
// list from distinct values in the rows; date-range filters expose
// `start` / `end` date inputs.

import { useMemo } from "react";
import type { DashboardFilter } from "@/lib/types/dashboard";
import { CloseIcon } from "@/components/ui/CloseButton";
import type { ChartFilter, Row } from "./types";

export interface FilterState {
  /** Column name -> selected dropdown value (null = no selection). */
  dropdowns: Record<string, string | null>;
  /** Column name -> `{ start, end }` ISO-date strings (null = unset). */
  dateRanges: Record<
    string,
    { start: string | null; end: string | null }
  >;
}

export const emptyFilterState: FilterState = {
  dropdowns: {},
  dateRanges: {},
};

interface FilterBarProps {
  filters: DashboardFilter[];
  rows: Row[];
  state: FilterState;
  onChange: (next: FilterState) => void;
  /** Active cross-filter from a chart click (doughnut/bar/choropleth).
   *  Rendered as an inline pill to the right of the dropdowns so it
   *  doesn't grow the dashboard header height when it appears. */
  chartFilter?: ChartFilter | null;
  /** Called when the user clears the chart filter pill. */
  onClearChartFilter?: () => void;
}

function distinctValues(rows: Row[], column: string): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    const v = row[column];
    if (v == null) continue;
    let s: string;
    if (v instanceof Date) {
      // An invalid Date (`NaN` time) throws on `toISOString()`. Skip
      // silently so one bad row doesn't blow up the whole filter.
      if (Number.isNaN(v.getTime())) continue;
      s = v.toISOString();
    } else {
      s = String(v);
    }
    seen.add(s);
  }
  return Array.from(seen).sort();
}

export function FilterBar({
  filters,
  rows,
  state,
  onChange,
  chartFilter,
  onClearChartFilter,
}: FilterBarProps) {
  const dropdownOptions = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const f of filters) {
      if (f.kind === "dropdown") map[f.column] = distinctValues(rows, f.column);
    }
    return map;
  }, [filters, rows]);

  if (filters.length === 0 && !chartFilter) return null;

  return (
    <div
      data-testid="filter-bar"
      className="flex flex-wrap items-end gap-3 rounded-[13px] border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)] p-3 shadow-sm"
    >
      {filters.map((f) => {
        if (f.kind === "dropdown") {
          const options = dropdownOptions[f.column] ?? [];
          const value = state.dropdowns[f.column] ?? "";
          return (
            <label
              key={`d-${f.column}`}
              className="flex flex-col text-xs text-[color:var(--color-ink-2)]"
            >
              <span className="mb-1 font-semibold">{f.label}</span>
              <select
                className="cursor-pointer rounded border border-[color:var(--color-carrot)] px-2 py-1 text-sm focus:border-orange-400 focus:outline-none"
                value={value}
                onChange={(e) => {
                  const v = e.target.value;
                  onChange({
                    ...state,
                    dropdowns: {
                      ...state.dropdowns,
                      [f.column]: v === "" ? null : v,
                    },
                  });
                }}
              >
                <option value="">All</option>
                {options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>
          );
        }

        const range = state.dateRanges[f.column] ?? { start: null, end: null };
        return (
          <div
            key={`r-${f.column}`}
            className="flex flex-col text-xs text-[color:var(--color-ink-2)]"
          >
            <span className="mb-1 font-semibold">{f.label}</span>
            <div className="flex gap-2">
              <input
                type="date"
                aria-label={`${f.label} start`}
                value={range.start ?? ""}
                className="rounded border border-[color:var(--color-carrot)] px-2 py-1 text-sm focus:border-orange-400 focus:outline-none"
                onChange={(e) => {
                  const v = e.target.value;
                  onChange({
                    ...state,
                    dateRanges: {
                      ...state.dateRanges,
                      [f.column]: { start: v === "" ? null : v, end: range.end },
                    },
                  });
                }}
              />
              <input
                type="date"
                aria-label={`${f.label} end`}
                value={range.end ?? ""}
                className="rounded border border-[color:var(--color-carrot)] px-2 py-1 text-sm focus:border-orange-400 focus:outline-none"
                onChange={(e) => {
                  const v = e.target.value;
                  onChange({
                    ...state,
                    dateRanges: {
                      ...state.dateRanges,
                      [f.column]: { start: range.start, end: v === "" ? null : v },
                    },
                  });
                }}
              />
            </div>
          </div>
        );
      })}
      {chartFilter && (
        <div className="ml-auto flex items-center gap-2">
          <span className="rounded-full bg-[color:var(--color-carrot-soft)] px-3 py-1 text-xs text-[color:var(--color-carrot)]">
            {chartFilter.column}: {chartFilter.value}
          </span>
          {onClearChartFilter && (
            <button
              type="button"
              onClick={onClearChartFilter}
              className="inline-flex items-center gap-1 text-xs text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink-2)]"
              aria-label="Clear chart filter"
            >
              <CloseIcon size={12} />
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Apply the filter state to a list of rows. */
export function applyFilters(rows: Row[], state: FilterState): Row[] {
  return rows.filter((row) => {
    for (const [col, val] of Object.entries(state.dropdowns)) {
      if (val == null) continue;
      const rv = row[col];
      const rs = rv instanceof Date ? rv.toISOString() : String(rv ?? "");
      if (rs !== val) return false;
    }
    for (const [col, range] of Object.entries(state.dateRanges)) {
      if (range.start == null && range.end == null) continue;
      const rv = row[col];
      let rd: Date | null = null;
      if (rv instanceof Date) rd = rv;
      else if (typeof rv === "string" || typeof rv === "number") {
        const d = new Date(rv);
        rd = isNaN(d.getTime()) ? null : d;
      }
      if (rd == null) return false;
      // Compare in UTC on both sides so the filter isn't timezone-sensitive.
      // Parquet dates arrive as UTC midnight; the `<input type="date">`
      // value is a date-only string with no zone, so we pin it to UTC too.
      if (range.start) {
        const s = new Date(range.start + "T00:00:00Z");
        if (rd < s) return false;
      }
      if (range.end) {
        const e = new Date(range.end + "T23:59:59.999Z");
        if (rd > e) return false;
      }
    }
    return true;
  });
}

export default FilterBar;
