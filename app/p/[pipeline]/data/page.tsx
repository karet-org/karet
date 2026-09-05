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
        <div key={i} className="mb-1 rounded-md border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)] px-2.5 py-2">
          <div className="h-3 w-2/3 animate-pulse rounded bg-[color:var(--color-rule)]" />
          <div className="mt-1.5 h-2 w-1/3 animate-pulse rounded bg-[color:var(--color-surface-2)]" />
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
      : "border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)] hover:border-[color:var(--color-carrot)] hover:bg-[color:var(--color-carrot-soft)]";

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
            <div className="truncate text-sm font-medium text-[color:var(--color-ink)]">{r.name}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[color:var(--color-ink-3)]">
              <code className="rounded bg-[color:var(--color-surface-2)] px-1 py-0.5 font-mono text-[color:var(--color-ink-2)]">{r.slug}</code>
              <span>{r.schema.length} cols</span>
              <span>· {r.meta}</span>
              {r.collidesWith && <span className="text-amber-700">name collides</span>}
            </div>
          </button>
          <button
            type="button"
            onClick={() => toggleExpanded(r.key)}
            aria-label={isOpen ? "Hide columns" : "Show columns"}
            className="px-2 py-2 text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink-2)]"
          >
            <span className={`inline-block transition-transform ${isOpen ? "rotate-90" : ""}`}>›</span>
          </button>
        </div>
        {isOpen && (
          <ul className="border-t border-[color:var(--color-rule-soft)] px-2.5 py-1.5">
            {r.schema.map((c) => (
              <li key={c.name} className="flex items-center justify-between py-0.5 text-[11px]">
                <span className="truncate text-[color:var(--color-ink-2)]">{c.name}</span>
                <span className="ml-2 shrink-0 text-[color:var(--color-ink-3)]">{c.type}</span>
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
          <div className="truncate text-sm font-medium text-[color:var(--color-ink)]">{q.name}</div>
          <code className="mt-0.5 block truncate font-mono text-[10px] text-[color:var(--color-ink-3)]">{q.sql}</code>
        </button>
        <DeleteButton
          label={`Delete query ${q.name}`}
          onClick={() => { setDeleteError(null); setDeleteTarget(q); }}
        />
      </div>
    </div>
  );

  // 48 = MOBILE_NAV_HEIGHT_PX; the desktop side nav takes no vertical space.
  return (
    <div className="flex flex-col md:h-screen md:flex-row">
      <aside className="flex w-full shrink-0 flex-col border-b border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface-2)] md:w-64 md:border-b-0 md:border-r">
        <div className="flex border-b border-[color:var(--color-rule-soft)]" role="tablist" aria-label="Data views">
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
                  ? "border-b-2 border-[color:var(--color-carrot)] text-[color:var(--color-carrot)]"
                  : "text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink-2)]"
              }`}
            >
              {label} <span className="text-[color:var(--color-ink-3)]">({count})</span>
            </button>
          ))}
        </div>
        <div className="max-h-[35vh] flex-1 overflow-y-auto p-2 md:max-h-none">
          {sidebarTab === "warehouse" ? (
            tablesLoading ? (
              <SidebarSkeleton />
            ) : tablesError ? (
              <p className="px-2 py-1 text-[11px] text-[color:var(--color-rose-deep)]">{tablesError}</p>
            ) : relations.length === 0 ? (
              <p className="px-2 py-1 text-[11px] text-[color:var(--color-ink-3)]">No tables yet.</p>
            ) : (
              relations.map(renderRelation)
            )
          ) : queriesLoading ? (
            <SidebarSkeleton />
          ) : queriesError ? (
            <p className="px-2 py-1 text-[11px] text-[color:var(--color-rose-deep)]">{queriesError}</p>
          ) : queries.length === 0 ? (
            <p className="px-2 py-1 text-[11px] text-[color:var(--color-ink-3)]">
              No saved queries yet. Run a query and click Save.
            </p>
          ) : (
            queries.map(renderQuery)
          )}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col gap-3 px-4 py-4 sm:px-6 md:min-h-0 md:overflow-hidden">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold text-[color:var(--color-ink)]">Data</h1>
          <p className="hidden text-[12.5px] text-[color:var(--color-ink-3)] sm:block">
            Query analytic tables with DuckDB SQL, joins across tables are supported.
          </p>
        </div>

        {bucketError && (
          <div className="rounded-md border border-[color:var(--color-rose-deep)] bg-[color:var(--color-rose-soft)] px-4 py-3 text-sm text-[color:var(--color-rose-deep)]">
            <strong>S3 bucket not found.</strong> {bucketError}
          </div>
        )}

        {/* Results frame: fills the space above the editor and keeps its
            size regardless of how many rows came back. */}
        <div
          className="flex min-h-[280px] flex-1 flex-col overflow-hidden rounded-lg border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)] md:min-h-0"
          data-testid="query-results-frame"
        >
          <div className="flex items-center gap-2.5 border-b border-[color:var(--color-rule-soft)] px-3.5 py-2">
            <span className="text-[12.5px] font-semibold text-[color:var(--color-ink)]">
              Results
            </span>
            {result && (
              <span className="text-[11.5px] text-[color:var(--color-ink-3)]">
                {result.length} row{result.length !== 1 ? "s" : ""}
                {result.length > 200 ? " (showing first 200)" : ""}
              </span>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {error ? (
              <p className="px-3.5 py-3 text-xs text-[color:var(--color-rose-deep)]" role="alert">
                {error}
              </p>
            ) : !result ? (
              <p className="grid h-full place-items-center px-3.5 py-8 text-[12.5px] text-[color:var(--color-ink-4)]">
                Run a query to see results
              </p>
            ) : (
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 bg-[color:var(--color-surface)]">
                  <tr className="border-b border-[color:var(--color-rule-soft)]">
                    {resultCols.map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-[color:var(--color-ink-2)]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.slice(0, 200).map((row, i) => (
                    <tr key={i} className="border-b border-[color:var(--color-rule-soft)] hover:bg-[color:var(--color-surface-2)]">
                      {resultCols.map((h) => (
                        <td key={h} className="px-3 py-1.5 text-[color:var(--color-ink-2)]">{String(row[h] ?? "")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Editor pinned below the results frame. */}
        <div className="rounded-lg border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)]" data-testid="query-editor">
          <div className="p-2.5">
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
              inputClassName="w-full rounded border border-[color:var(--color-rule)] bg-transparent px-3 py-2 font-mono text-xs text-[color:var(--color-ink)] focus:border-[color:var(--color-carrot)] focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2.5 border-t border-[color:var(--color-rule-soft)] px-2.5 py-2">
            <p className="hidden min-w-0 truncate text-[11px] text-[color:var(--color-ink-3)] sm:block">
              Runs server-side against the warehouse. Enter runs the query.
            </p>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => { setSaveError(null); setSaveOpen(true); }}
                disabled={!sql.trim()}
                className="rounded border border-[color:var(--color-rule)] px-4 py-1.5 text-xs font-medium text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => runQuery()}
                disabled={loading}
                className="rounded bg-[color:var(--color-carrot)] px-4 py-1.5 text-xs font-medium text-white hover:bg-[color:var(--color-carrot-deep)] disabled:opacity-50"
              >
                {loading ? "Running…" : "Run"}
              </button>
            </div>
          </div>
        </div>
      </main>

      <Modal open={saveOpen} onClose={() => !saving && setSaveOpen(false)}>
        <h2 className="text-lg font-semibold text-[color:var(--color-ink)]">Save query</h2>
        <p className="mt-1 text-sm text-[color:var(--color-ink-3)]">
          Give the query a unique name. The query is validated before saving,
          and you can reference it from a dashboard config with{" "}
          <code className="rounded bg-[color:var(--color-surface-2)] px-1">query_id</code>.
        </p>
        <input
          type="text"
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") saveQuery(); }}
          placeholder="Monthly spend by category"
          autoFocus
          className="mt-4 w-full rounded border border-[color:var(--color-rule)] px-3 py-2 text-sm text-[color:var(--color-ink)] focus:border-orange-400 focus:outline-none"
        />
        {saveName.trim() && (
          <p className="mt-1 text-[11px] text-[color:var(--color-ink-3)]">
            id: <code className="rounded bg-[color:var(--color-surface-2)] px-1 font-mono">{nameToSlug(saveName)}</code>
          </p>
        )}
        {saveError && <p className="mt-2 text-xs text-[color:var(--color-rose-deep)]">{saveError}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setSaveOpen(false)}
            disabled={saving}
            className="rounded border border-[color:var(--color-rule)] px-4 py-1.5 text-sm text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={saveQuery}
            disabled={saving}
            className="rounded bg-[color:var(--color-carrot)] px-4 py-1.5 text-sm font-medium text-white hover:bg-[color:var(--color-carrot-deep)] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </Modal>

      <Modal open={deleteTarget !== null} onClose={() => !deleting && setDeleteTarget(null)}>
        <h2 className="text-lg font-semibold text-[color:var(--color-ink)]">Delete query</h2>
        <p className="mt-1 text-sm text-[color:var(--color-ink-3)]">
          Delete <strong className="text-[color:var(--color-ink)]">{deleteTarget?.name}</strong>? Dashboards
          that reference it with <code className="rounded bg-[color:var(--color-surface-2)] px-1">query_id</code> will
          stop loading. This can&apos;t be undone.
        </p>
        {deleteError && <p className="mt-2 text-xs text-[color:var(--color-rose-deep)]">{deleteError}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setDeleteTarget(null)}
            disabled={deleting}
            className="rounded border border-[color:var(--color-rule)] px-4 py-1.5 text-sm text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            disabled={deleting}
            className="rounded bg-[color:var(--color-rose-deep)] px-4 py-1.5 text-sm font-medium text-white hover:bg-[color:var(--color-rose-deep)] disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
