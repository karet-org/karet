// Data page: a table browser. Tables and saved queries on the left; tabs on the
// right, one per open table (Data and Properties) plus the SQL editor.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "@/lib/client/navigation";
import Modal from "@/components/ui/Modal";
import DataNavigator from "@/components/data/DataNavigator";
import SqlWorkspace from "@/components/data/SqlWorkspace";
import TableData from "@/components/data/TableData";
import TableProperties from "@/components/data/TableProperties";
import type { TableInfo } from "@/components/data/types";
import type { SavedQuery } from "@/lib/types/query";
import { nameToSlug } from "@/lib/config/name-to-slug";
import { useCanHere } from "@/lib/client/use-current-user";
import { IconClose, IconPanelLeftOpen } from "@/components/icons";
import { toolSecondary } from "@/components/data/toolbar";
import { clampNavWidth, NAV_DEFAULT_WIDTH } from "@/lib/data/navigator";

type RawTable = Omit<TableInfo, "slug" | "collidesWith">;
type View = "data" | "properties";
const SQL_TAB = "sql";

const tabClass = (active: boolean) =>
  `flex shrink-0 items-center gap-1.5 border-b-2 px-3 text-[12.5px] ${
    active
      ? "border-[color:var(--color-carrot)] text-[color:var(--color-ink)]"
      : "border-transparent text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)]"
  }`;

export default function DataPage() {
  const { pipeline } = useParams<{ pipeline: string }>();
  const canEdit = useCanHere(pipeline, "editor");

  const [rawTables, setRawTables] = useState<RawTable[]>([]);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [bucketError, setBucketError] = useState<string | null>(null);
  const [queries, setQueries] = useState<SavedQuery[]>([]);
  const [queriesError, setQueriesError] = useState<string | null>(null);

  // Open tabs: table ids in the order opened, plus the SQL tab, which is always there.
  const [openTables, setOpenTables] = useState<string[]>([]);
  const [active, setActive] = useState<string>(SQL_TAB);
  const [views, setViews] = useState<Record<string, View>>({});
  // navOpen shows the navigator on phones; navHidden hides it on wider screens.
  const [navOpen, setNavOpen] = useState(false);
  const [navHidden, setNavHidden] = useState(false);
  const [navWidth, setNavWidth] = useState(NAV_DEFAULT_WIDTH);

  const [sql, setSql] = useState("");
  const [runRequest, setRunRequest] = useState<{ id: number; sql: string } | null>(null);

  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SavedQuery | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadTables = useCallback(async () => {
    setTablesError(null);
    try {
      const r = await fetch(`/api/p/${pipeline}/tables`);
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (body.error === "bucket_not_found") setBucketError(body.message);
        else setTablesError(body.message ?? "Could not load tables.");
        return;
      }
      setRawTables(body.tables ?? []);
    } catch (e) {
      setTablesError(e instanceof Error ? e.message : String(e));
    } finally {
      setTablesLoading(false);
    }
  }, [pipeline]);

  const loadQueries = useCallback(async () => {
    setQueriesError(null);
    try {
      const r = await fetch(`/api/p/${pipeline}/queries`);
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        setQueriesError(body.message ?? "Could not load saved queries.");
        return;
      }
      setQueries(body.queries ?? []);
    } catch (e) {
      setQueriesError(e instanceof Error ? e.message : String(e));
    }
  }, [pipeline]);

  useEffect(() => {
    void loadTables();
    void loadQueries();
  }, [loadTables, loadQueries]);

  // SQL names, and which tables share one (only the first is queryable by it).
  const tables = useMemo<TableInfo[]>(() => {
    const seen = new Map<string, string>();
    return rawTables.map((t) => {
      const slug = nameToSlug(t.name);
      const owner = seen.get(slug);
      if (owner === undefined) seen.set(slug, t.id);
      return { ...t, slug, collidesWith: owner ?? null };
    });
  }, [rawTables]);

  // Open the first table when the page loads, so it shows data straight away.
  useEffect(() => {
    if (openTables.length > 0 || tables.length === 0) return;
    setOpenTables([tables[0].id]);
    setActive(tables[0].id);
    setSql(`SELECT * FROM ${tables[0].slug} LIMIT 50`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables]);

  const sqlSchema = useMemo(() => {
    const schema: Record<string, string[]> = {};
    for (const t of tables) if (!t.collidesWith) schema[t.slug] = t.schema.map((c) => c.name);
    return schema;
  }, [tables]);

  const openTable = (id: string, view?: View) => {
    setOpenTables((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setActive(id);
    if (view) setViews((prev) => ({ ...prev, [id]: view }));
    setNavOpen(false);
  };

  // Drag the navigator's right edge to resize it.
  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = navWidth;
    const move = (ev: PointerEvent) => setNavWidth(clampNavWidth(startWidth + ev.clientX - startX));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const closeTable = (id: string) => {
    setOpenTables((prev) => {
      const next = prev.filter((t) => t !== id);
      if (active === id) setActive(next.at(-1) ?? SQL_TAB);
      return next;
    });
  };

  const openQuery = (q: SavedQuery) => {
    setSql(q.sql);
    setActive(SQL_TAB);
    setRunRequest((r) => ({ id: (r?.id ?? 0) + 1, sql: q.sql }));
    setNavOpen(false);
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

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/p/${pipeline}/queries/${deleteTarget.id}`, { method: "DELETE" });
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

  const byId = new Map(tables.map((t) => [t.id, t]));

  return (
    <div className="flex flex-col md:h-full md:flex-row">
      {navHidden && (
        <button
          type="button"
          onClick={() => setNavHidden(false)}
          aria-label="Show the table list"
          title="Show the table list"
          data-testid="show-navigator"
          className="hidden w-9 shrink-0 items-start justify-center border-r border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)] pt-2.5 text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)] md:flex"
        >
          <IconPanelLeftOpen size={15} />
        </button>
      )}
      <aside
        style={{ "--nav-width": `${navWidth}px` } as React.CSSProperties}
        className={`${navOpen ? "block" : "hidden"} ${navHidden ? "" : "md:block"} relative max-h-[50vh] shrink-0 border-b border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)] md:max-h-none md:w-[var(--nav-width)] md:border-b-0 md:border-r`}
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the table list"
          aria-valuenow={navWidth}
          tabIndex={0}
          onPointerDown={startResize}
          onDoubleClick={() => setNavWidth(NAV_DEFAULT_WIDTH)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setNavWidth((w) => clampNavWidth(w - 16));
            if (e.key === "ArrowRight") setNavWidth((w) => clampNavWidth(w + 16));
          }}
          data-testid="navigator-resize"
          className="absolute -right-1 top-0 z-10 hidden h-full w-2 cursor-col-resize hover:bg-[color:var(--color-carrot)]/30 focus-visible:bg-[color:var(--color-carrot)]/40 md:block"
        />
        <DataNavigator
          tables={tables}
          tablesLoading={tablesLoading}
          tablesError={tablesError}
          queries={queries}
          queriesError={queriesError}
          activeTable={active === SQL_TAB ? null : active}
          onOpenTable={openTable}
          onOpenQuery={openQuery}
          onDeleteQuery={(q) => {
            setDeleteError(null);
            setDeleteTarget(q);
          }}
          onNewQuery={() => {
            setActive(SQL_TAB);
            setNavOpen(false);
          }}
          onCollapse={() => {
            setNavHidden(true);
            setNavOpen(false);
          }}
        />
      </aside>

      <main className="flex min-h-[70vh] min-w-0 flex-1 flex-col md:min-h-0">
        {bucketError && (
          <div className="m-3 rounded-md border border-[color:var(--color-rose-deep)] bg-[color:var(--color-rose-soft)] px-4 py-3 text-sm text-[color:var(--color-rose-deep)]">
            <strong>S3 bucket not found.</strong> {bucketError}
          </div>
        )}

        <div className="flex h-9 shrink-0 items-stretch border-b border-[color:var(--color-rule-soft)]" role="tablist" aria-label="Open tables">
          <button
            type="button"
            onClick={() => setNavOpen((v) => !v)}
            aria-expanded={navOpen}
            className={toolSecondary("mx-2 self-center md:hidden")}
          >
            Tables
          </button>
          <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
            {openTables.map((id) => {
              const t = byId.get(id);
              if (!t) return null;
              return (
                <div key={id} className={tabClass(active === id)}>
                  <button type="button" role="tab" aria-selected={active === id} onClick={() => setActive(id)} data-testid={`tab-${id}`}>
                    {t.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => closeTable(id)}
                    aria-label={`Close ${t.name}`}
                    className="grid h-4 w-4 place-items-center rounded text-[color:var(--color-ink-4)] hover:text-[color:var(--color-ink)]"
                  >
                    <IconClose size={11} />
                  </button>
                </div>
              );
            })}
            <button type="button" role="tab" aria-selected={active === SQL_TAB} onClick={() => setActive(SQL_TAB)} data-testid="tab-sql" className={tabClass(active === SQL_TAB)}>
              SQL
            </button>
          </div>
        </div>

        {openTables.map((id) => {
          const t = byId.get(id);
          if (!t) return null;
          const view = views[id] ?? "data";
          return (
            <section key={id} hidden={active !== id} className="flex min-h-0 flex-1 flex-col" aria-label={t.name}>
              <div className="flex h-8 shrink-0 items-center gap-0.5 border-b border-[color:var(--color-rule-soft)] pl-1 pr-3">
                {(["data", "properties"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setViews((prev) => ({ ...prev, [id]: v }))}
                    aria-pressed={view === v}
                    data-testid={`view-${v}`}
                    className={`h-6 rounded px-2 text-[11.5px] font-medium ${
                      view === v ? "bg-[color:var(--color-surface-2)] text-[color:var(--color-ink)]" : "text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)]"
                    }`}
                  >
                    {v === "data" ? "Data" : "Properties"}
                  </button>
                ))}
                <code className="ml-auto truncate font-mono text-[11px] text-[color:var(--color-ink-4)]">{t.slug}</code>
              </div>
              {view === "data" ? (
                <TableData pipeline={pipeline} table={t} />
              ) : (
                <TableProperties pipeline={pipeline} table={t} canEdit={canEdit} onRestored={() => void loadTables()} />
              )}
            </section>
          );
        })}

        <section hidden={active !== SQL_TAB} className="flex min-h-0 flex-1 flex-col" aria-label="SQL">
          <SqlWorkspace
            pipeline={pipeline}
            sql={sql}
            onSqlChange={setSql}
            schema={sqlSchema}
            runRequest={runRequest}
            onSave={() => {
              setSaveError(null);
              setSaveOpen(true);
            }}
          />
        </section>
      </main>

      <Modal open={saveOpen} onClose={() => !saving && setSaveOpen(false)}>
        <h2 className="text-lg font-semibold text-[color:var(--color-ink)]">Save query</h2>
        <input
          type="text"
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void saveQuery();
          }}
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
            onClick={() => void saveQuery()}
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
          Delete <strong className="text-[color:var(--color-ink)]">{deleteTarget?.name}</strong>? Dashboards that
          reference it with <code className="rounded bg-[color:var(--color-surface-2)] px-1">query_id</code> will stop
          loading. This can&apos;t be undone.
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
            onClick={() => void confirmDelete()}
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
