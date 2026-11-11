"use client";

// Left panel of the Data page: a filter, the pipeline's tables with their
// columns, row counts and last publish, and the saved queries.

import { useEffect, useRef, useState } from "react";
import type { SavedQuery } from "@/lib/types/query";
import type { TableInfo } from "./types";
import { ageLabel, filterNavigator, rowsLabel } from "@/lib/data/navigator";
import { IconChevronRight, IconClose, IconMore, IconPanelLeftClose } from "@/components/icons";
import { iconButton, toolInput } from "./toolbar";

type View = "data" | "properties";

/** Actions for one table, opened from its menu button or a right-click. */
function TableMenu({
  table,
  at,
  onOpen,
  onClose,
}: {
  table: TableInfo;
  at: { x: number; y: number };
  onOpen: (view: View) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.querySelector("button")?.focus();
  }, []);

  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [onClose]);

  const copy = async (label: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(onClose, 600);
  };

  const item = "block w-full px-3 py-1 text-left text-[12.5px] text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-ink)] focus:bg-[color:var(--color-surface-2)] focus:outline-none";
  const actions: [string, () => void][] = [
    ["Open data", () => onOpen("data")],
    ["Open properties", () => onOpen("properties")],
    ["Copy SQL name", () => void copy("Copy SQL name", table.slug)],
    ["Copy SELECT", () => void copy("Copy SELECT", `SELECT * FROM ${table.slug} LIMIT 100`)],
  ];

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`${table.name} actions`}
      data-testid="table-menu"
      style={{ left: at.x, top: at.y }}
      className="fixed z-50 min-w-[11rem] rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-surface)] py-1 shadow-lg"
    >
      {actions.map(([label, run]) => (
        <button key={label} type="button" role="menuitem" onClick={run} className={item}>
          {copied === label ? "Copied" : label}
        </button>
      ))}
    </div>
  );
}

export default function DataNavigator({
  tables,
  tablesLoading,
  tablesError,
  queries,
  queriesError,
  activeTable,
  onOpenTable,
  onOpenQuery,
  onDeleteQuery,
  onNewQuery,
  onCollapse,
}: {
  tables: TableInfo[];
  tablesLoading: boolean;
  tablesError: string | null;
  queries: SavedQuery[];
  queriesError: string | null;
  activeTable: string | null;
  onOpenTable: (id: string, view?: View) => void;
  onOpenQuery: (q: SavedQuery) => void;
  onDeleteQuery: (q: SavedQuery) => void;
  onNewQuery: () => void;
  /** Hide the panel; absent where it cannot be hidden (phones). */
  onCollapse?: () => void;
}) {
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ table: TableInfo; x: number; y: number } | null>(null);
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const match = filterNavigator(tables, queries, filter);
  const filtering = filter.trim() !== "";
  const heading = "px-3 pb-0.5 pt-2 text-[10.5px] font-medium uppercase tracking-[0.06em] text-[color:var(--color-ink-4)]";

  return (
    <nav data-testid="data-navigator" aria-label="Tables and saved queries" className="flex h-full flex-col text-[12.5px]">
      <div className="flex items-center gap-1 border-b border-[color:var(--color-rule-soft)] px-2 py-1.5">
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setFilter("");
          }}
          placeholder="Filter tables and columns"
          aria-label="Filter tables, columns and saved queries"
          data-testid="navigator-filter"
          className={toolInput("min-w-0 flex-1")}
        />
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Hide the table list"
            title="Hide the table list"
            className={iconButton()}
          >
            <IconPanelLeftClose size={15} />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={heading}>
          Tables {tablesLoading ? "" : filtering ? `(${match.tables.length} of ${tables.length})` : `(${tables.length})`}
        </div>
        {tablesError ? (
          <p className="px-3 text-[11.5px] text-[color:var(--color-rose-deep)]">{tablesError}</p>
        ) : tablesLoading ? (
          <div className="space-y-2 px-3" aria-hidden>
            {[0, 1].map((i) => (
              <div key={i} className="h-4 w-3/4 animate-pulse rounded bg-[color:var(--color-surface-2)]" />
            ))}
          </div>
        ) : tables.length === 0 ? (
          <p className="px-3 text-[11.5px] text-[color:var(--color-ink-4)]">
            No tables yet. Add an analytic table on the Graph page and run the pipeline.
          </p>
        ) : match.tables.length === 0 ? (
          <p className="px-3 text-[11.5px] text-[color:var(--color-ink-4)]">No table or column matches.</p>
        ) : (
          <ul>
            {match.tables.map(({ table: t, columns, matchedColumns }) => {
              const open = expanded.has(t.id) || matchedColumns;
              const rows = t.version > 0 ? (rowsLabel(t.rowCount) ?? "") : "No data";
              const age = ageLabel(t.publishedAt);
              return (
                <li key={t.id}>
                  <div
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenu({ table: t, x: e.clientX, y: e.clientY });
                    }}
                    className={`group flex items-center gap-0.5 pl-1.5 pr-1 ${
                      activeTable === t.id ? "bg-[color:var(--color-surface-2)]" : "hover:bg-[color:var(--color-surface-2)]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(t.id)}
                      aria-expanded={open}
                      aria-label={`${open ? "Hide" : "Show"} columns of ${t.name}`}
                      className="grid h-6 w-5 shrink-0 place-items-center text-[color:var(--color-ink-4)]"
                    >
                      <IconChevronRight size={12} className={`transition-transform ${open ? "rotate-90" : ""}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenTable(t.id)}
                      data-testid={`open-table-${t.id}`}
                      title={t.collidesWith ? "Its SQL name collides with another table" : `Open ${t.name}${age ? `, published ${age}` : ""}`}
                      className="flex h-6 min-w-0 flex-1 items-baseline gap-2 text-left"
                    >
                      <span className="min-w-0 truncate font-medium text-[color:var(--color-ink)]">{t.name}</span>
                      <span className="ml-auto shrink-0 text-[10.5px] tabular-nums text-[color:var(--color-ink-4)]" data-testid={`table-meta-${t.id}`}>
                        {rows}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`${t.name} actions`}
                      aria-haspopup="menu"
                      onClick={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        setMenu({ table: t, x: r.left, y: r.bottom + 2 });
                      }}
                      className="grid h-5 w-5 shrink-0 place-items-center rounded text-[color:var(--color-ink-3)] opacity-0 hover:bg-[color:var(--color-rule-soft)] hover:text-[color:var(--color-ink)] focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <IconMore size={14} />
                    </button>
                  </div>
                  {open && (
                    <ul className="pb-0.5 pl-7 pr-2">
                      {columns.map((c) => (
                        <li key={c.name} className="flex items-baseline gap-2 py-px text-[11.5px]">
                          <span className="truncate text-[color:var(--color-ink-2)]">{c.name}</span>
                          {t.partitionKeys.includes(c.name) && (
                            <span title="Partition key" className="text-[10px] text-[color:var(--color-carrot)]">P</span>
                          )}
                          {t.dedupKeys.includes(c.name) && (
                            <span title="Dedup key" className="text-[10px] text-[color:var(--color-leaf-deep)]">K</span>
                          )}
                          <span className="ml-auto shrink-0 text-[color:var(--color-ink-4)]">{c.type}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className={`${heading} flex items-center`}>
          <span>Saved queries</span>
          <button
            type="button"
            onClick={onNewQuery}
            className="ml-auto rounded px-1.5 normal-case tracking-normal text-[color:var(--color-ink-3)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-ink)]"
          >
            SQL editor
          </button>
        </div>
        {queriesError ? (
          <p className="px-3 text-[11.5px] text-[color:var(--color-rose-deep)]">{queriesError}</p>
        ) : match.queries.length === 0 ? (
          <p className="px-3 pb-3 text-[11.5px] text-[color:var(--color-ink-4)]">
            {filtering && queries.length > 0 ? "No saved query matches." : "None yet. Save one from the SQL editor."}
          </p>
        ) : (
          <ul className="pb-3">
            {match.queries.map((q) => (
              <li key={q.id} className="group flex items-center px-3 hover:bg-[color:var(--color-surface-2)]">
                <button type="button" onClick={() => onOpenQuery(q)} title={q.sql} className="h-6 min-w-0 flex-1 truncate text-left text-[color:var(--color-ink-2)]">
                  {q.name}
                </button>
                <button
                  type="button"
                  aria-label={`Delete query ${q.name}`}
                  onClick={() => onDeleteQuery(q)}
                  className="grid h-5 w-5 place-items-center rounded text-[color:var(--color-ink-4)] opacity-0 hover:text-[color:var(--color-rose-deep)] focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <IconClose size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {menu && (
        <TableMenu
          table={menu.table}
          at={{ x: menu.x, y: menu.y }}
          onOpen={(view) => {
            onOpenTable(menu.table.id, view);
            setMenu(null);
          }}
          onClose={() => setMenu(null)}
        />
      )}
    </nav>
  );
}
