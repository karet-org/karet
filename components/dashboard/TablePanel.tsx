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
      className="flex flex-1 flex-col rounded-lg border border-orange-100 bg-white p-4 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-emerald-600">{config.title}</h3>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-600">
            <tr>
              {config.columns.map((c) => (
                <th
                  key={c}
                  scope="col"
                  className="px-3 py-2 text-left font-semibold"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr key={start + i} className="border-t border-gray-100">
                {config.columns.map((c) => (
                  <td key={c} className="px-3 py-1.5 text-gray-800">
                    {formatCell(row[c])}
                  </td>
                ))}
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td
                  colSpan={config.columns.length}
                  className="px-3 py-4 text-center text-gray-500"
                >
                  No rows
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs text-gray-600">
          <span>
            Page {safePage + 1} of {pageCount}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage(Math.max(0, safePage - 1))}
              disabled={safePage === 0}
              className="rounded border border-gray-300 px-2 py-1 disabled:opacity-50"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
              disabled={safePage >= pageCount - 1}
              className="rounded border border-gray-300 px-2 py-1 disabled:opacity-50"
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
