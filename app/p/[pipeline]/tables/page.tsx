"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import alasql from "alasql";
import { TOP_NAV_HEIGHT_PX } from "@/components/layout/TopNav";
import { ExpandableTextField } from "@/components/ui/ExpandableTextField";

interface TableInfo { id: string; name: string; schema: { name: string; type: string }[]; fileCount: number }

/**
 * Convert a table's display `name` into a SQL-safe identifier the user
 * can type in queries. The Tables tab registers each AlaSQL table
 * under this slug rather than the internal config `id`, so the
 * sidebar's "Monthly Transactions" becomes `monthly_transactions` in
 * the query box.
 *
 * Lowercase, ASCII alnum + underscore. Runs of non-conforming chars
 * collapse to a single `_`. Leading/trailing underscores trimmed.
 * Falls back to `_table` when the name is empty or all-punctuation,
 * so we never register a table under the empty string.
 */
function nameToSlug(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "_table";
}

interface ResolvedTable extends TableInfo {
  /** SQL identifier the user types in the query box. Derived from `name`. */
  slug: string;
  /**
   * `null` when the slug is unique. When set, points at the duplicate
   * table's id; the sidebar surfaces this so the user knows to rename
   * one of the two before either can be queried.
   */
  collidesWith: string | null;
}

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
      setTables(d.tables ?? []);
    });
  }, [pipeline]);

  // Resolve each table's SQL slug from its display name and detect
  // collisions. Memoized off `tables` so it only recomputes when the
  // set of tables actually changes.
  const resolvedTables = useMemo<ResolvedTable[]>(() => {
    const seen = new Map<string, string>(); // slug -> first owner id
    return tables.map((t) => {
      const slug = nameToSlug(t.name);
      const existingOwner = seen.get(slug);
      if (existingOwner === undefined) {
        seen.set(slug, t.id);
        return { ...t, slug, collidesWith: null };
      }
      return { ...t, slug, collidesWith: existingOwner };
    });
  }, [tables]);

  // Set the initial query once the resolved set is ready.
  useEffect(() => {
    const first = resolvedTables.find((t) => !t.collidesWith);
    if (first && sql === "") {
      setSql(`SELECT * FROM ${first.slug} LIMIT 50`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedTables]);

  // Load all table data into AlaSQL under the user-friendly slug.
  // Skip colliding entries -- registering both would arbitrarily pick
  // one and silently shadow the other; better to refuse and surface
  // the collision in the sidebar.
  useEffect(() => {
    if (resolvedTables.length === 0) return;
    setLoading(true);
    Promise.all(
      resolvedTables.map(async (t) => {
        if (t.collidesWith) return;
        if (loadedRef.current.has(t.slug)) return;
        const res = await fetch(`/api/p/${pipeline}/tables/${t.id}/rows`);
        if (!res.ok) return;
        const data = await res.json();
        const rows = data.rows ?? [];
        alasql(`DROP TABLE IF EXISTS ${t.slug}`);
        alasql(`CREATE TABLE ${t.slug}`);
        alasql.tables[t.slug].data = rows;
        loadedRef.current.add(t.slug);
      }),
    ).then(() => {
      setLoadedTables(new Set(loadedRef.current));
      setLoading(false);
      const first = resolvedTables.find((t) => !t.collidesWith);
      if (first) runQuery(`SELECT * FROM ${first.slug} LIMIT 50`);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedTables, pipeline]);

  /** Extract slugs referenced in the SQL. */
  const findReferencedTables = useCallback((query: string) => {
    const slugs = new Set<string>();
    for (const t of resolvedTables) {
      const re = new RegExp(
        `\\b${t.slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
        "i",
      );
      if (re.test(query)) slugs.add(t.slug);
    }
    return slugs;
  }, [resolvedTables]);

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

  const selectTable = (slug: string) => {
    const q = `SELECT * FROM ${slug} LIMIT 50`;
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

  const itemClass = (slug: string, collidesWith: string | null) => {
    if (collidesWith) return "border-amber-300 bg-amber-50";
    if (referencedTables.has(slug)) return "border-orange-400 bg-orange-50";
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
          {resolvedTables.map((t) => {
            const isOpen = expanded.has(t.id);
            return (
              <div
                key={t.id}
                className={`mb-1 rounded-md border transition ${itemClass(t.slug, t.collidesWith)}`}
              >
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => !t.collidesWith && selectTable(t.slug)}
                    disabled={Boolean(t.collidesWith)}
                    className="flex-1 truncate px-2.5 py-2 text-left disabled:cursor-not-allowed"
                    title={
                      t.collidesWith
                        ? `Slug "${t.slug}" collides with another table. Rename one in the graph editor.`
                        : t.slug
                    }
                  >
                    <div className="truncate text-sm font-medium text-gray-800">{t.name}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-gray-400">
                      <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-gray-600">
                        {t.slug}
                      </code>
                      <span>{t.schema.length} cols</span>
                      {loadedTables.has(t.slug) && <span className="text-green-600">●</span>}
                      {t.collidesWith && (
                        <span className="text-amber-700">name collides</span>
                      )}
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
          Query analytic tables with SQL. Use the slug shown next to each
          table name. Joins are supported.
        </p>

        {bucketError && (
          <div className="mt-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            <strong>S3 bucket not found.</strong> {bucketError}
          </div>
        )}

        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex gap-2">
            <div className="flex-1">
              <ExpandableTextField
                ariaLabel="SQL query"
                value={sql}
                onChange={setSql}
                onKeyDown={(e) => { if (e.key === "Enter") runQuery(); }}
                onModalAction={() => runQuery()}
                placeholder="SELECT * FROM transactions JOIN cashflow ON ..."
                spellCheck={false}
                modalTitle="SQL query"
                modalActionLabel="Run"
                inputClassName="w-full rounded border border-gray-300 px-3 py-1.5 font-mono text-xs text-gray-800 focus:border-orange-400 focus:outline-none"
              />
            </div>
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
