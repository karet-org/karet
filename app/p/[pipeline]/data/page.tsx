"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ExpandableTextField } from "@/components/ui/ExpandableTextField";
import Modal from "@/components/ui/Modal";
import { DeleteButton } from "@/components/ui/DeleteButton";
import type { SavedQuery } from "@/lib/types/query";

interface Column { name: string; type: string }
interface TableInfo { id: string; name: string; schema: Column[]; fileCount: number }

/** Convert a display name into a SQL-safe identifier (matches the query endpoint). */
function nameToSlug(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "_x";
}

interface Relation {
  key: string;
  name: string;
  schema: Column[];
  /** SQL identifier to type in the query box. */
  slug: string;
  /** Warehouse part count. */
  meta: string;
  /** id of the relation this one's slug collides with, else null. */
  collidesWith: string | null;
}

/** Placeholder rows shown while the sidebar list is loading. */
function SidebarSkeleton() {
  return (
    <div className="space-y-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="mb-1 rounded-md border border-gray-200 bg-white px-2.5 py-2">
          <div className="h-3 w-2/3 animate-pulse rounded bg-gray-200" />
          <div className="mt-1.5 h-2 w-1/3 animate-pulse rounded bg-gray-100" />
        </div>
      ))}
    </div>
  );
}

export default function DataPage() {
  const { pipeline } = useParams<{ pipeline: string }>();
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [queries, setQueries] = useState<SavedQuery[]>([]);
  const [sidebarTab, setSidebarTab] = useState<"warehouse" | "queries">("warehouse");
  const [loading, setLoading] = useState(false);
  const [sql, setSql] = useState("");
  const [result, setResult] = useState<Record<string, unknown>[] | null>(null);
  const [resultCols, setResultCols] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [bucketError, setBucketError] = useState<string | null>(null);

  // Sidebar fetch state, tracked per source so a failure shows an error
  // instead of a misleading "empty" list.
  const [tablesLoading, setTablesLoading] = useState(true);
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [queriesLoading, setQueriesLoading] = useState(true);
  const [queriesError, setQueriesError] = useState<string | null>(null);

  // Save-query modal state.
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete-query confirmation modal state.
  const [deleteTarget, setDeleteTarget] = useState<SavedQuery | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Load table metadata.
  useEffect(() => {
    setTablesLoading(true);
    setTablesError(null);
    fetch(`/api/p/${pipeline}/tables`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          if (body.error === "bucket_not_found") setBucketError(body.message);
          else setTablesError(body.message ?? "Could not load tables.");
          return;
        }
        const d = await r.json();
        setTables(d.tables ?? []);
      })
      .catch((e) => setTablesError(e instanceof Error ? e.message : String(e)))
      .finally(() => setTablesLoading(false));
  }, [pipeline]);

  const loadQueries = useCallback(async () => {
    setQueriesLoading(true);
    setQueriesError(null);
    try {
      const r = await fetch(`/api/p/${pipeline}/queries`);
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setQueriesError(body.message ?? "Could not load saved queries.");
        return;
      }
      const d = await r.json();
      setQueries(d.queries ?? []);
    } catch (e) {
      setQueriesError(e instanceof Error ? e.message : String(e));
    } finally {
      setQueriesLoading(false);
    }
  }, [pipeline]);

  useEffect(() => {
    loadQueries();
  }, [loadQueries]);

  // Resolve every table to its query slug and flag slug collisions.
  const relations = useMemo<Relation[]>(() => {
    const seen = new Map<string, string>();
    return tables.map((t) => {
      const key = `t:${t.id}`;
      const slug = nameToSlug(t.name);
      const meta = `${t.fileCount} file${t.fileCount !== 1 ? "s" : ""}`;
      const owner = seen.get(slug);
      if (owner === undefined) {
        seen.set(slug, key);
        return { key, name: t.name, schema: t.schema, slug, meta, collidesWith: null };
      }
      return { key, name: t.name, schema: t.schema, slug, meta, collidesWith: owner };
    });
  }, [tables]);

  const runQuery = useCallback(async (query?: string) => {
    const q = query ?? sql;
    if (!q.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/p/${pipeline}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: q }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.message ?? data.error ?? "Query failed");
        setResult(null);
      } else {
        setResult(data.rows ?? []);
        setResultCols(data.columns ?? (data.rows?.length > 0 ? Object.keys(data.rows[0]) : []));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [sql, pipeline]);

  // Seed the query box with the first table once metadata loads.
  useEffect(() => {
    if (sql !== "") return;
    const first = relations.find((r) => !r.collidesWith);
    if (first) setSql(`SELECT * FROM ${first.slug} LIMIT 50`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relations]);

  // Auto-run the initial query once metadata loads.
  useEffect(() => {
    if (relations.length > 0 && !result && !error) {
      const first = relations.find((r) => !r.collidesWith);
      if (first) runQuery(`SELECT * FROM ${first.slug} LIMIT 50`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relations]);

  const selectRelation = (slug: string) => {
    const q = `SELECT * FROM ${slug} LIMIT 50`;
    setSql(q);
    runQuery(q);
  };

  const loadSavedQuery = (q: SavedQuery) => {
    setSql(q.sql);
    runQuery(q.sql);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/p/${pipeline}/queries/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setDeleteError(body.message ?? "Could not delete query.");
        return;
      }
      await loadQueries();
      setDeleteTarget(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  };

  const saveQuery = async () => {
    const name = saveName.trim();
    if (!name) {
      setSaveError("Enter a name.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/p/${pipeline}/queries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, sql }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.message ?? "Could not save query.");
        return;
      }
      setSaveOpen(false);
      setSaveName("");
      await loadQueries();
      setSidebarTab("queries");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Cards sit on a gray-50 panel, so the hover tint is a light orange rather
  // than gray-50 (which would be invisible against the panel background).
  const itemClass = (collidesWith: string | null) =>
    collidesWith
      ? "border-amber-300 bg-amber-50"
      : "border-gray-200 bg-white hover:border-orange-200 hover:bg-orange-50";

  const renderRelation = (r: Relation) => {
    const isOpen = expanded.has(r.key);
    return (
      <div
        key={r.key}
        className={`mb-1 rounded-md border transition ${itemClass(r.collidesWith)}`}
      >
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => !r.collidesWith && selectRelation(r.slug)}
            disabled={Boolean(r.collidesWith)}
            className="flex-1 truncate px-2.5 py-2 text-left disabled:cursor-not-allowed"
            title={
              r.collidesWith
                ? `Slug "${r.slug}" collides with another relation. Rename one in the graph editor.`
                : r.slug
            }
          >
            <div className="truncate text-sm font-medium text-gray-800">{r.name}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-gray-400">
              <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-gray-600">{r.slug}</code>
              <span>{r.schema.length} cols</span>
              <span>· {r.meta}</span>
              {r.collidesWith && <span className="text-amber-700">name collides</span>}
            </div>
          </button>
          <button
            type="button"
            onClick={() => toggleExpanded(r.key)}
            aria-label={isOpen ? "Hide columns" : "Show columns"}
            className="px-2 py-2 text-gray-400 hover:text-gray-600"
          >
            <span className={`inline-block transition-transform ${isOpen ? "rotate-90" : ""}`}>›</span>
          </button>
        </div>
        {isOpen && (
          <ul className="border-t border-gray-200/60 px-2.5 py-1.5">
            {r.schema.map((c) => (
              <li key={c.name} className="flex items-center justify-between py-0.5 text-[11px]">
                <span className="truncate text-gray-600">{c.name}</span>
                <span className="ml-2 shrink-0 text-gray-400">{c.type}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  const renderQuery = (q: SavedQuery) => (
    <div
      key={q.id}
      className={`mb-1 rounded-md border transition ${itemClass(null)}`}
    >
      <div className="flex items-center pr-1.5">
        <button
          type="button"
          onClick={() => loadSavedQuery(q)}
          className="flex-1 truncate px-2.5 py-2 text-left"
          title={q.sql}
        >
          <div className="truncate text-sm font-medium text-gray-800">{q.name}</div>
          <code className="mt-0.5 block truncate font-mono text-[10px] text-gray-400">{q.sql}</code>
        </button>
        <DeleteButton
          label={`Delete query ${q.name}`}
          onClick={() => { setDeleteError(null); setDeleteTarget(q); }}
        />
      </div>
    </div>
  );

  // 52 = TOP_NAV_HEIGHT_PX (Tailwind arbitrary values can't read the constant).
  return (
    <div className="flex flex-col md:h-[calc(100vh-52px)] md:flex-row">
      <aside className="flex w-full shrink-0 flex-col border-b border-gray-200 bg-gray-50 md:w-64 md:border-b-0 md:border-r">
        <div className="flex border-b border-gray-200" role="tablist" aria-label="Data views">
          {([
            ["warehouse", "Warehouse", tables.length],
            ["queries", "Queries", queries.length],
          ] as const).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={sidebarTab === id}
              onClick={() => setSidebarTab(id)}
              className={`flex-1 px-3 py-2 text-xs font-medium transition ${
                sidebarTab === id
                  ? "border-b-2 border-orange-500 text-orange-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {label} <span className="text-gray-400">({count})</span>
            </button>
          ))}
        </div>
        <div className="max-h-[35vh] flex-1 overflow-y-auto p-2 md:max-h-none">
          {sidebarTab === "warehouse" ? (
            tablesLoading ? (
              <SidebarSkeleton />
            ) : tablesError ? (
              <p className="px-2 py-1 text-[11px] text-red-600">{tablesError}</p>
            ) : relations.length === 0 ? (
              <p className="px-2 py-1 text-[11px] text-gray-400">No tables yet.</p>
            ) : (
              relations.map(renderRelation)
            )
          ) : queriesLoading ? (
            <SidebarSkeleton />
          ) : queriesError ? (
            <p className="px-2 py-1 text-[11px] text-red-600">{queriesError}</p>
          ) : queries.length === 0 ? (
            <p className="px-2 py-1 text-[11px] text-gray-400">
              No saved queries yet. Run a query and click Save.
            </p>
          ) : (
            queries.map(renderQuery)
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6 md:overflow-y-auto">
        <h1 className="text-xl font-semibold text-gray-900">Data</h1>
        <p className="mt-1 text-sm text-gray-500">
          Query your analytic tables (warehouse) with SQL. Use the slug shown
          next to each table; joins across tables are supported. Save a query
          to reuse it or reference it from a dashboard.
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
                placeholder="SELECT * FROM transactions LIMIT 50"
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
              {loading ? "Running…" : "Run"}
            </button>
            <button
              type="button"
              onClick={() => { setSaveError(null); setSaveOpen(true); }}
              disabled={!sql.trim()}
              className="rounded border border-gray-300 px-4 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Save
            </button>
          </div>
          <p className="mt-1 text-[10px] text-gray-400">
            Queries run server-side against the warehouse. Try: <code className="rounded bg-gray-100 px-1">SELECT * FROM transactions LIMIT 50</code>
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

      <Modal open={saveOpen} onClose={() => !saving && setSaveOpen(false)}>
        <h2 className="text-lg font-semibold text-gray-900">Save query</h2>
        <p className="mt-1 text-sm text-gray-500">
          Give the query a unique name. The query is validated before saving,
          and you can reference it from a dashboard config with{" "}
          <code className="rounded bg-gray-100 px-1">query_id</code>.
        </p>
        <input
          type="text"
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") saveQuery(); }}
          placeholder="Monthly spend by category"
          autoFocus
          className="mt-4 w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-orange-400 focus:outline-none"
        />
        {saveName.trim() && (
          <p className="mt-1 text-[11px] text-gray-400">
            id: <code className="rounded bg-gray-100 px-1 font-mono">{nameToSlug(saveName)}</code>
          </p>
        )}
        {saveError && <p className="mt-2 text-xs text-red-600">{saveError}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setSaveOpen(false)}
            disabled={saving}
            className="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={saveQuery}
            disabled={saving}
            className="rounded bg-orange-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </Modal>

      <Modal open={deleteTarget !== null} onClose={() => !deleting && setDeleteTarget(null)}>
        <h2 className="text-lg font-semibold text-gray-900">Delete query</h2>
        <p className="mt-1 text-sm text-gray-500">
          Delete <strong className="text-gray-800">{deleteTarget?.name}</strong>? Dashboards
          that reference it with <code className="rounded bg-gray-100 px-1">query_id</code> will
          stop loading. This can&apos;t be undone.
        </p>
        {deleteError && <p className="mt-2 text-xs text-red-600">{deleteError}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setDeleteTarget(null)}
            disabled={deleting}
            className="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            disabled={deleting}
            className="rounded bg-red-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
