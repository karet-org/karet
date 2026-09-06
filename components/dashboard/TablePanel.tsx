"use client";

// Table panel: renders the declared columns as an HTML table, paginated
// client-side by `page_size` (defaults to 50).

import { useState } from "react";
import type { Panel } from "@/lib/types/dashboard";
import type { PanelProps } from "./types";

type TablePanelConfig = Extract<Panel, { kind: "table" }>;

function formatCell(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "bigint") return String(v);
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function TablePanel({ config, rows }: PanelProps<TablePanelConfig>) {
  const pageSize = Math.max(1, config.page_size ?? 50);
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  return (
    <div
      data-testid="table-panel"
      className="flex flex-1 flex-col min-w-0 rounded-[13px] border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)] p-4 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-[color:var(--color-leaf-deep)]">{config.title}</h3>
      <div className="mt-3 overflow-x-auto">
        <table className="data-table min-w-full">
          <thead>
            <tr>
              {config.columns.map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr key={start + i}>
                {config.columns.map((c) => (
                  <td key={c}>{formatCell(row[c])}</td>
                ))}
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td
                  colSpan={config.columns.length}
                  className="py-4 text-center text-[color:var(--color-ink-3)]"
                >
                  No rows
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs text-[color:var(--color-ink-2)]">
          <span>
            Page {safePage + 1} of {pageCount}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage(Math.max(0, safePage - 1))}
              disabled={safePage === 0}
              className="cursor-pointer rounded border border-[color:var(--color-rule)] px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
              disabled={safePage >= pageCount - 1}
              className="cursor-pointer rounded border border-[color:var(--color-rule)] px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default TablePanel;
