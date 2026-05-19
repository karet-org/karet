"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import alasql from "alasql";
import { TOP_NAV_HEIGHT_PX } from "@/components/layout/TopNav";

interface TableInfo { id: string; name: string; schema: { name: string; type: string }[]; fileCount: number }

export default function TablesPage() {
  const { pipeline } = useParams<{ pipeline: string }>();
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loadedTables, setLoadedTables] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [sql, setSql] = useState("");
  const [result, setResult] = useState<Record<string, unknown>[] | null>(null);
  const [resultCols, setResultCols] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [referencedTables, setReferencedTables] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const loadedRef = useRef(new Set<string>());
  const [bucketError, setBucketError] = useState<string | null>(null);

  // Load table metadata
  useEffect(() => {
    fetch(`/api/p/${pipeline}/tables`).then(async (r) => {
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        if (body.error === "bucket_not_found") setBucketError(body.message);
        return;
      }
      const d = await r.json();
      const t = d.tables ?? [];
      setTables(t);
      if (t.length > 0) setSql(`SELECT * FROM ${t[0].id} LIMIT 50`);
    });
  }, [pipeline]);

  // Load all table data into AlaSQL
  useEffect(() => {
    if (tables.length === 0) return;
    setLoading(true);
    Promise.all(
      tables.map(async (t) => {
        if (loadedRef.current.has(t.id)) return;
        const res = await fetch(`/api/p/${pipeline}/tables/${t.id}/rows`);
        if (!res.ok) return;
        const data = await res.json();
        const rows = data.rows ?? [];
        alasql(`DROP TABLE IF EXISTS ${t.id}`);
        alasql(`CREATE TABLE ${t.id}`);
        alasql.tables[t.id].data = rows;
        loadedRef.current.add(t.id);
      }),
    ).then(() => {
      setLoadedTables(new Set(loadedRef.current));
      setLoading(false);
      // Auto-run initial query
      if (tables.length > 0) runQuery(`SELECT * FROM ${tables[0].id} LIMIT 50`);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables, pipeline]);

  /** Extract table names referenced in the SQL. */
  const findReferencedTables = useCallback((query: string) => {
    const ids = new Set<string>();
    const tableIds = tables.map((t) => t.id);
    for (const id of tableIds) {
      // Match table id as a whole word in the query (case-insensitive)
      const re = new RegExp(`\\b${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (re.test(query)) ids.add(id);
    }
    return ids;
  }, [tables]);

  const runQuery = useCallback((query?: string) => {
    const q = query ?? sql;
    try {
      const res = alasql(q);
      if (!Array.isArray(res)) {
        setResult([{ result: String(res) }]);
        setResultCols(["result"]);
      } else {
        setResult(res);
        setResultCols(res.length > 0 ? Object.keys(res[0]) : []);
      }
      setError(null);
      setReferencedTables(findReferencedTables(q));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
      setReferencedTables(findReferencedTables(q));
    }
  }, [sql, findReferencedTables]);

  const selectTable = (id: string) => {
    const q = `SELECT * FROM ${id} LIMIT 50`;
    setSql(q);
    runQuery(q);
  };

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const itemClass = (id: string) => {
    if (referencedTables.has(id)) return "border-orange-400 bg-orange-50";
    return "border-transparent bg-white hover:bg-gray-50";
  };

  return (
    <div
      className="flex"
      style={{ height: `calc(100vh - ${TOP_NAV_HEIGHT_PX}px)` }}
    >
      <aside className="flex w-64 shrink-0 flex-col border-r border-gray-200 bg-gray-50">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Tables</h2>
          <p className="mt-0.5 text-[11px] text-gray-400">
            {tables.length} table{tables.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {tables.map((t) => {
            const isOpen = expanded.has(t.id);
            return (
              <div
                key={t.id}
                className={`mb-1 rounded-md border transition ${itemClass(t.id)}`}
              >
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => selectTable(t.id)}
                    className="flex-1 truncate px-2.5 py-2 text-left"
                    title={t.id}
                  >
                    <div className="truncate text-sm font-medium text-gray-800">{t.name}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-gray-400">
                      <code className="rounded bg-gray-100 px-1 py-0.5 text-gray-500">{t.id}</code>
                      <span>{t.schema.length} cols</span>
                      {loadedTables.has(t.id) && <span className="text-green-600">●</span>}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleExpanded(t.id)}
                    aria-label={isOpen ? "Hide columns" : "Show columns"}
                    className="px-2 py-2 text-gray-400 hover:text-gray-600"
                  >
                    <span className={`inline-block transition-transform ${isOpen ? "rotate-90" : ""}`}>›</span>
                  </button>
                </div>
                {isOpen && (
                  <ul className="border-t border-gray-200/60 px-2.5 py-1.5">
                    {t.schema.map((c) => (
                      <li key={c.name} className="flex items-center justify-between py-0.5 text-[11px]">
                        <span className="truncate text-gray-600">{c.name}</span>
                        <span className="ml-2 shrink-0 text-gray-400">{c.type}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto px-6 py-6">
        <h1 className="text-xl font-semibold text-gray-900">Tables</h1>
        <p className="mt-1 text-sm text-gray-500">
          Query analytic tables with SQL. Use table IDs in your query. Joins are supported.
        </p>

        {bucketError && (
          <div className="mt-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            <strong>S3 bucket not found.</strong> {bucketError}
          </div>
        )}

        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex gap-2">
            <input
              type="text"
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") runQuery(); }}
              placeholder="SELECT * FROM transactions JOIN cashflow ON ..."
              className="flex-1 rounded border border-gray-300 px-3 py-1.5 font-mono text-xs text-gray-800 focus:border-orange-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => runQuery()}
              disabled={loading}
              className="rounded bg-orange-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {loading ? "Loading…" : "Run"}
            </button>
          </div>
          <p className="mt-1 text-[10px] text-gray-400">
            All tables are loaded in-browser. Try: <code className="rounded bg-gray-100 px-1">SELECT t.description, t.amount, c.memo FROM transactions t JOIN cashflow c ON t.date = c.date</code>
          </p>

          {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
          {result && (
            <div className="mt-3 max-h-[60vh] overflow-auto rounded border border-gray-100">
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-gray-200">
                    {resultCols.map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-gray-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.slice(0, 200).map((row, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                      {resultCols.map((h) => (
                        <td key={h} className="px-3 py-1.5 text-gray-700">{String(row[h] ?? "")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="bg-white px-3 py-1 text-xs text-gray-400">
                {result.length} row{result.length !== 1 ? "s" : ""}{result.length > 200 ? " (showing first 200)" : ""}
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
