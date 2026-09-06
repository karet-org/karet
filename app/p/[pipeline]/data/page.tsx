"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Modal from "@/components/ui/Modal";
import SqlEditor from "@/components/data/SqlEditor";
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

export default function DataPage() {
  const { pipeline } = useParams<{ pipeline: string }>();
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [queries, setQueries] = useState<SavedQuery[]>([]);
  const [loading, setLoading] = useState(false);
  const [sql, setSql] = useState("");
  const [result, setResult] = useState<Record<string, unknown>[] | null>(null);
  const [resultCols, setResultCols] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tablesOpen, setTablesOpen] = useState(false);
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

  // table slug -> column names, for editor autocomplete.
  const sqlSchema = useMemo(() => {
    const schema: Record<string, string[]> = {};
    for (const r of relations) {
      if (!r.collidesWith) schema[r.slug] = r.schema.map((c) => c.name);
    }
    return schema;
  }, [relations]);

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
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };


  return (
    <div className="flex flex-col md:h-full md:flex-row">
      <main className="flex min-w-0 flex-1 flex-col gap-3 px-4 py-4 sm:px-6 md:min-h-0 md:overflow-hidden">
        <div className="flex items-start gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[color:var(--color-ink)]">Data</h1>
            <p className="mt-1 text-[12.5px] text-[color:var(--color-ink-3)]">
              Query analytic tables with DuckDB SQL
            </p>
          </div>
          <button
            type="button"
            onClick={() => setTablesOpen((v) => !v)}
            aria-pressed={tablesOpen}
            data-testid="toggle-tables-panel"
            className={`ml-auto inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors ${
              tablesOpen
                ? "border-[color:var(--color-carrot)] bg-[color:var(--color-carrot-soft)] text-[color:var(--color-ink)]"
                : "border-[color:var(--color-rule)] text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)]"
            }`}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
              <path d="M10 2.5v11" />
            </svg>
            Tables
          </button>
        </div>

        {bucketError && (
          <div className="rounded-md border border-[color:var(--color-rose-deep)] bg-[color:var(--color-rose-soft)] px-4 py-3 text-sm text-[color:var(--color-rose-deep)]">
            <strong>S3 bucket not found.</strong> {bucketError}
          </div>
        )}

        {/* Results frame: fixed size regardless of row count. */}
        <div
          className="flex min-h-[280px] flex-1 flex-col overflow-hidden rounded-[13px] border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)] md:min-h-0"
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
              <table className="data-table min-w-full">
                <thead className="sticky top-0 bg-[color:var(--color-surface)]">
                  <tr>
                    {resultCols.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.slice(0, 200).map((row, i) => (
                    <tr key={i}>
                      {resultCols.map((h) => (
                        <td key={h}>{String(row[h] ?? "")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Editor pinned below the results frame. */}
        <div className="rounded-[13px] border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)]" data-testid="query-editor">
          <SqlEditor
            value={sql}
            onChange={setSql}
            onRun={() => runQuery()}
            schema={sqlSchema}
            placeholder="SELECT * FROM transactions LIMIT 50"
          />
          <div className="flex items-center gap-1.5 border-t border-[color:var(--color-rule-soft)] px-2.5 py-2">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
              {queriesError ? (
                <span className="text-[11px] text-[color:var(--color-rose-deep)]">{queriesError}</span>
              ) : queriesLoading ? (
                <span className="text-[11px] text-[color:var(--color-ink-4)]">Loading queries…</span>
              ) : (
                queries.map((q) => {
                  const active = sql === q.sql;
                  return (
                    <span key={q.id} className="group/chip relative shrink-0">
                      <button
                        type="button"
                        onClick={() => loadSavedQuery(q)}
                        title={q.sql}
                        className={`rounded-md py-1 pl-2.5 pr-6 text-[11.5px] font-medium transition-colors ${
                          active
                            ? "bg-[color:var(--color-surface-2)] text-[color:var(--color-ink)]"
                            : "text-[color:var(--color-ink-3)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-ink)]"
                        }`}
                      >
                        {q.name}
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete query ${q.name}`}
                        onClick={() => setDeleteTarget(q)}
                        className="absolute right-1 top-1/2 grid h-4 w-4 -translate-y-1/2 place-items-center rounded text-[color:var(--color-ink-4)] opacity-0 hover:text-[color:var(--color-rose-deep)] focus-visible:opacity-100 group-hover/chip:opacity-100"
                      >
                        <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <path d="M4 4l8 8M12 4l-8 8" />
                        </svg>
                      </button>
                    </span>
                  );
                })
              )}
            </div>
            <span className="hidden shrink-0 text-[11px] text-[color:var(--color-ink-4)] sm:block">
              Ctrl+Enter
            </span>
            <button
              type="button"
              onClick={() => { setSaveError(null); setSaveOpen(true); }}
              disabled={!sql.trim()}
              className="shrink-0 rounded-md border border-[color:var(--color-rule)] px-3.5 py-1.5 text-[12px] font-medium text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-50"
            >
              Save query
            </button>
            <button
              type="button"
              onClick={() => runQuery()}
              disabled={loading}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[color:var(--color-carrot)] px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-[color:var(--color-carrot-deep)] disabled:opacity-50"
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                <path d="M5 3.5v9l8-4.5-8-4.5z" />
              </svg>
              {loading ? "Running…" : "Run"}
            </button>
          </div>
        </div>
      </main>

      {/* Right panel: the pipeline's target tables. */}
      {tablesOpen && (
        <aside
          data-testid="tables-panel"
          className="w-full shrink-0 overflow-y-auto border-t border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)] px-4 py-4 md:w-[264px] md:border-l md:border-t-0"
        >
          <div className="pb-2 text-[10.5px] font-medium tracking-[0.06em] text-[color:var(--color-ink-3)]">
            TABLES {tablesLoading ? "" : `(${relations.length})`}
          </div>
          {tablesError ? (
            <p className="text-[11.5px] text-[color:var(--color-rose-deep)]">{tablesError}</p>
          ) : tablesLoading ? (
            <div className="space-y-2" aria-hidden>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-4 w-3/4 animate-pulse rounded bg-[color:var(--color-surface-2)]" />
              ))}
            </div>
          ) : relations.length === 0 ? (
            <p className="text-[11.5px] text-[color:var(--color-ink-4)]">
              No tables yet. Add an analytic table on the Graph page and run the pipeline.
            </p>
          ) : (
            relations.map((r) => (
              <div key={r.key} className="border-b border-[color:var(--color-rule-soft)] py-2.5 last:border-b-0">
                <button
                  type="button"
                  onClick={() => selectRelation(r.slug)}
                  disabled={r.collidesWith !== null}
                  title={r.collidesWith ? `Slug collides with ${r.collidesWith}` : `SELECT * FROM ${r.slug}`}
                  className="flex w-full items-center gap-2 text-left disabled:opacity-50"
                >
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-[color:var(--color-ink)] hover:text-[color:var(--color-carrot-deep)]">
                    {r.name}
                  </span>
                  <span className="shrink-0 text-[10.5px] text-[color:var(--color-ink-4)]">{r.meta}</span>
                </button>
                <code className="mt-0.5 block truncate font-mono text-[10.5px] text-[color:var(--color-ink-3)]">
                  {r.slug}
                </code>
                {r.collidesWith && (
                  <p className="mt-1 text-[10.5px] text-[color:var(--color-amber-deep)]">
                    Name collides with another table; rename one to query it.
                  </p>
                )}
                <ul className="mt-1.5 space-y-0.5">
                  {r.schema.map((c, i) => (
                    <li key={i} className="flex justify-between gap-2 text-[11px]">
                      <span className="truncate text-[color:var(--color-ink-2)]">{c.name}</span>
                      <span className="shrink-0 text-[color:var(--color-ink-4)]">{c.type}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </aside>
      )}

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
