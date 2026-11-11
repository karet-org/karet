"use client";

// The Data tab of one table: a WHERE filter, a server-sorted and paged grid,
// and the cell viewer.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import ResultGrid, { type CellRef, type GridColumn } from "./ResultGrid";
import CellViewer from "./CellViewer";
import type { TableInfo } from "./types";
import { downloadCsv, nextSort, toCsv, type Row, type Sort } from "@/lib/data/grid";
import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconDownload,
  IconRefresh,
} from "@/components/icons";
import { iconButton, toolButton, toolInput, toolSecondary } from "./toolbar";

const PAGE_SIZES = [50, 100, 200, 500];

interface Page {
  columns: GridColumn[];
  rows: Row[];
  total: number;
}

export default function TableData({ pipeline, table }: { pipeline: string; table: TableInfo }) {
  const [filterInput, setFilterInput] = useState("");
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<Sort | null>(null);
  const [pageSize, setPageSize] = useState(100);
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<Page | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CellRef | null>(null);
  const published = table.version > 0;

  const load = useCallback(async () => {
    if (!published) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ offset: String(offset), limit: String(pageSize) });
    if (filter) params.set("where", filter);
    if (sort) {
      params.set("sort", sort.column);
      params.set("dir", sort.dir);
    }
    try {
      const res = await fetch(`/api/p/${pipeline}/tables/${table.id}/rows?${params}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? body.error ?? `HTTP ${res.status}`);
      setPage({ columns: body.columns, rows: body.rows, total: body.total });
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [pipeline, table.id, published, offset, pageSize, filter, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!published) {
    return (
      <div className="grid flex-1 place-items-center px-4 py-10 text-center" data-testid="empty-table-notice">
        <div>
          <p className="text-[12.5px] text-[color:var(--color-ink-2)]">{table.name} has no data yet.</p>
          <Link href={`/p/${pipeline}/jobs`} className="mt-2 inline-block text-[12px] text-[color:var(--color-carrot)] hover:underline">
            Go to Jobs
          </Link>
        </div>
      </div>
    );
  }

  const applyFilter = () => {
    setOffset(0);
    setFilter(filterInput.trim());
  };
  const total = page?.total ?? 0;
  const last = Math.max(0, Math.floor((total - 1) / pageSize) * pageSize);
  const selectedColumn = selected ? page?.columns.find((c) => c.name === selected.column) : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <form
        className="flex min-h-9 shrink-0 flex-wrap items-center gap-1.5 border-b border-[color:var(--color-rule-soft)] py-0.5 pl-3 pr-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          applyFilter();
        }}
      >
        <label htmlFor={`filter-${table.id}`} className="font-mono text-[11.5px] font-medium text-[color:var(--color-ink-3)]">
          WHERE
        </label>
        <input
          id={`filter-${table.id}`}
          data-testid="table-filter"
          value={filterInput}
          onChange={(e) => setFilterInput(e.target.value)}
          placeholder="status >= 500 AND path LIKE '/api/%'"
          spellCheck={false}
          className={toolInput("min-w-[12rem] flex-1 font-mono")}
        />
        <button type="submit" className={toolSecondary()}>
          Apply
        </button>
        {filter && (
          <button
            type="button"
            onClick={() => {
              setFilterInput("");
              setFilter("");
              setOffset(0);
            }}
            className={toolButton()}
          >
            Clear
          </button>
        )}
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className={iconButton()}
          aria-label="Reload this page of rows"
          title="Reload this page of rows"
        >
          <IconRefresh size={14} className={loading ? "animate-spin" : ""} />
        </button>
        <button
          type="button"
          disabled={!page || page.rows.length === 0}
          onClick={() =>
            page &&
            downloadCsv(
              `${table.slug}-rows-${offset + 1}-${offset + page.rows.length}.csv`,
              toCsv(page.columns.map((c) => c.name), page.rows),
            )
          }
          className={iconButton()}
          aria-label="Download the rows on this page as CSV"
          title="Download the rows on this page as CSV"
        >
          <IconDownload size={14} />
        </button>
      </form>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="min-h-[240px] min-w-0 flex-1 overflow-auto" data-testid="table-data-grid">
          {error ? (
            <p className="px-3.5 py-3 text-xs text-[color:var(--color-rose-deep)]" role="alert">
              {error}
            </p>
          ) : !page ? (
            <p className="px-3.5 py-3 text-[12px] text-[color:var(--color-ink-4)]">Loading…</p>
          ) : page.rows.length === 0 ? (
            <p className="px-3.5 py-3 text-[12px] text-[color:var(--color-ink-4)]">
              {filter ? "No rows match the filter." : "The table is empty."}
            </p>
          ) : (
            <ResultGrid
              columns={page.columns}
              rows={page.rows}
              rowOffset={offset}
              sort={sort}
              onSort={(column) => {
                setOffset(0);
                setSort((s) => nextSort(s, column));
              }}
              selected={selected}
              onSelect={setSelected}
            />
          )}
        </div>
        {selected && page && (
          <CellViewer
            column={selected.column}
            type={selectedColumn?.type}
            value={page.rows[selected.row]?.[selected.column]}
            onClose={() => setSelected(null)}
          />
        )}
      </div>

      <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-2 border-t border-[color:var(--color-rule-soft)] py-0.5 pl-3 pr-1.5 text-[11.5px] text-[color:var(--color-ink-3)]">
        <span data-testid="table-row-range">
          {total === 0
            ? "0 rows"
            : `Rows ${(offset + 1).toLocaleString()}–${Math.min(offset + pageSize, total).toLocaleString()} of ${total.toLocaleString()}`}
          {filter ? " matching the filter" : ""}
        </span>
        <span className="ml-auto flex items-center gap-0.5">
          <label htmlFor={`page-size-${table.id}`} className="mr-1.5">
            Rows per page
          </label>
          <select
            id={`page-size-${table.id}`}
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setOffset(0);
            }}
            className={toolInput("mr-1.5 px-1.5 text-[11.5px]")}
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => setOffset(0)} disabled={offset === 0} className={iconButton()} aria-label="First page" title="First page">
            <IconChevronsLeft size={14} />
          </button>
          <button type="button" onClick={() => setOffset((o) => Math.max(0, o - pageSize))} disabled={offset === 0} className={iconButton()} aria-label="Previous page" title="Previous page">
            <IconChevronLeft size={14} />
          </button>
          <button type="button" onClick={() => setOffset((o) => o + pageSize)} disabled={offset + pageSize >= total} className={iconButton()} aria-label="Next page" title="Next page">
            <IconChevronRight size={14} />
          </button>
          <button type="button" onClick={() => setOffset(last)} disabled={offset + pageSize >= total} className={iconButton()} aria-label="Last page" title="Last page">
            <IconChevronsRight size={14} />
          </button>
        </span>
      </div>
    </div>
  );
}
