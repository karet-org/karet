"use client";

// The SQL tab: the editor above, its result grid below.

import { useCallback, useEffect, useState } from "react";
import SqlEditor, { type SqlSchema } from "./SqlEditor";
import ResultGrid, { type CellRef } from "./ResultGrid";
import CellViewer from "./CellViewer";
import { downloadCsv, nextSort, sortRows, toCsv, type Row, type Sort } from "@/lib/data/grid";
import { IconDownload, IconPlay, IconSave } from "@/components/icons";
import { iconButton, toolButton, toolPrimary } from "./toolbar";

/** Rows a query returns to the page; the rest are counted as cut off. */
const RESULT_LIMIT = 1000;

interface Result {
  columns: string[];
  rows: Row[];
  truncated: boolean;
  ms: number;
}

export default function SqlWorkspace({
  pipeline,
  sql,
  onSqlChange,
  schema,
  runRequest,
  onSave,
}: {
  pipeline: string;
  sql: string;
  onSqlChange: (sql: string) => void;
  schema: SqlSchema;
  /** Changing `id` runs `sql`: how the navigator opens a saved query. */
  runRequest: { id: number; sql: string } | null;
  onSave: () => void;
}) {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<Sort | null>(null);
  const [selected, setSelected] = useState<CellRef | null>(null);

  const run = useCallback(
    async (query: string) => {
      if (!query.trim()) return;
      setLoading(true);
      setError(null);
      const started = performance.now();
      try {
        const res = await fetch(`/api/p/${pipeline}/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sql: query, limit: RESULT_LIMIT }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.message ?? data.error ?? "Query failed");
        setResult({
          columns: data.columns ?? [],
          rows: data.rows ?? [],
          truncated: Boolean(data.truncated),
          ms: Math.round(performance.now() - started),
        });
        setSort(null);
        setSelected(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setResult(null);
      } finally {
        setLoading(false);
      }
    },
    [pipeline],
  );

  useEffect(() => {
    if (runRequest) void run(runRequest.sql);
  }, [runRequest, run]);

  const rows = result ? sortRows(result.rows, sort) : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-[color:var(--color-rule-soft)]" data-testid="query-editor">
        <SqlEditor
          value={sql}
          onChange={onSqlChange}
          onRun={() => void run(sql)}
          schema={schema}
          placeholder="SELECT * FROM transactions LIMIT 50"
        />
        <div className="flex items-center gap-1 border-t border-[color:var(--color-rule-soft)] py-1 pl-3 pr-1.5">
          <span className="text-[11.5px] text-[color:var(--color-ink-3)]" data-testid="query-status">
            {result &&
              `${result.rows.length.toLocaleString()} row${result.rows.length === 1 ? "" : "s"}${
                result.truncated ? `, cut off at ${RESULT_LIMIT.toLocaleString()}` : ""
              } in ${result.ms} ms`}
          </span>
          <span className="ml-auto hidden text-[11px] text-[color:var(--color-ink-4)] sm:block">Ctrl+Enter</span>
          <button
            type="button"
            disabled={!result || result.rows.length === 0}
            onClick={() => result && downloadCsv("query-result.csv", toCsv(result.columns, rows))}
            className={iconButton()}
            aria-label="Download the result as CSV"
            title="Download the result as CSV"
          >
            <IconDownload size={14} />
          </button>
          <button type="button" onClick={onSave} disabled={!sql.trim()} className={toolButton()}>
            <IconSave size={13} />
            Save query
          </button>
          <button type="button" onClick={() => void run(sql)} disabled={loading} className={toolPrimary()}>
            <IconPlay size={10} />
            {loading ? "Running…" : "Run"}
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="min-h-[240px] min-w-0 flex-1 overflow-auto" data-testid="query-results-frame">
          {error ? (
            <p className="px-3.5 py-3 text-xs text-[color:var(--color-rose-deep)]" role="alert">
              {error}
            </p>
          ) : !result ? (
            <p className="grid h-full place-items-center px-3.5 py-8 text-[12.5px] text-[color:var(--color-ink-4)]">
              Run a query to see results
            </p>
          ) : result.rows.length === 0 ? (
            <p className="px-3.5 py-3 text-[12px] text-[color:var(--color-ink-4)]">No rows.</p>
          ) : (
            <ResultGrid
              columns={result.columns.map((name) => ({ name }))}
              rows={rows}
              sort={sort}
              onSort={(column) => setSort((s) => nextSort(s, column))}
              selected={selected}
              onSelect={setSelected}
            />
          )}
        </div>
        {selected && result && (
          <CellViewer
            column={selected.column}
            value={rows[selected.row]?.[selected.column]}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  );
}
