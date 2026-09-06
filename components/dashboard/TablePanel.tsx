"use client";

// Table panel: renders the query result as-is, optionally subset and
// reordered by `columns`, paginated client-side.

import { useState } from "react";
import type { PanelV2 } from "@/lib/types/dashboard-v2";
import { panelCardClass, type PanelProps } from "./types";

type TableConfig = Extract<PanelV2, { kind: "table" }>;

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  if (typeof v === "number" && !Number.isInteger(v)) {
    return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return String(v);
}

export function TablePanel({ config, data }: PanelProps<TableConfig>) {
  const [page, setPage] = useState(0);
  const columns = config.columns?.length ? config.columns : data.columns;
  const pageSize = config.page_size ?? 10;
  const pages = Math.max(1, Math.ceil(data.rows.length / pageSize));
  const start = Math.min(page, pages - 1) * pageSize;
  const pageRows = data.rows.slice(start, start + pageSize);

  return (
    <div data-testid="table-panel" className={panelCardClass()}>
      <h3 className="text-sm font-semibold text-[color:var(--color-leaf-deep)]">{config.title}</h3>
      <div className="mt-3 flex-1 overflow-x-auto">
        <table className="data-table min-w-full">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c} scope="col">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr key={start + i}>
                {columns.map((c) => (
                  <td key={c}>{formatCell(row[c])}</td>
                ))}
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="py-4 text-center text-[color:var(--color-ink-3)]">
                  No rows
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs text-[color:var(--color-ink-2)]">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={start === 0}
            className="cursor-pointer rounded border border-[color:var(--color-rule)] px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Prev
          </button>
          <span>
            {start + 1}-{Math.min(start + pageSize, data.rows.length)} of {data.rows.length}
            {data.truncated ? "+" : ""}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
            disabled={start + pageSize >= data.rows.length}
            className="cursor-pointer rounded border border-[color:var(--color-rule)] px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export default TablePanel;
