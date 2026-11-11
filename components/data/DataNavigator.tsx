"use client";

// Left panel of the Data page: the pipeline's tables with their columns, and
// the saved queries.

import { useState } from "react";
import type { SavedQuery } from "@/lib/types/query";
import type { TableInfo } from "./types";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`}>
      <path d="M6 3.5l4.5 4.5L6 12.5" />
    </svg>
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
}: {
  tables: TableInfo[];
  tablesLoading: boolean;
  tablesError: string | null;
  queries: SavedQuery[];
  queriesError: string | null;
  activeTable: string | null;
  onOpenTable: (id: string) => void;
  onOpenQuery: (q: SavedQuery) => void;
  onDeleteQuery: (q: SavedQuery) => void;
  onNewQuery: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const heading = "px-3 pb-1 pt-3 text-[10.5px] font-medium uppercase tracking-[0.06em] text-[color:var(--color-ink-4)]";

  return (
    <nav data-testid="data-navigator" aria-label="Tables and saved queries" className="text-[12.5px]">
      <div className={heading}>Tables {tablesLoading ? "" : `(${tables.length})`}</div>
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
      ) : (
        <ul>
          {tables.map((t) => {
            const open = expanded.has(t.id);
            return (
              <li key={t.id}>
                <div
                  className={`group flex items-center gap-1 px-1.5 ${
                    activeTable === t.id ? "bg-[color:var(--color-surface-2)]" : "hover:bg-[color:var(--color-surface-2)]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggle(t.id)}
                    aria-expanded={open}
                    aria-label={`${open ? "Hide" : "Show"} columns of ${t.name}`}
                    className="grid h-6 w-5 place-items-center text-[color:var(--color-ink-4)]"
                  >
                    <Chevron open={open} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenTable(t.id)}
                    data-testid={`open-table-${t.id}`}
                    title={t.collidesWith ? "Its SQL name collides with another table" : `Open ${t.name}`}
                    className="flex min-w-0 flex-1 items-baseline gap-2 py-1 text-left"
                  >
                    <span className="truncate font-medium text-[color:var(--color-ink)]">{t.name}</span>
                    <span className="ml-auto shrink-0 text-[10.5px] text-[color:var(--color-ink-4)]">
                      {t.version > 0 ? `v${t.version}` : "no data"}
                    </span>
                  </button>
                </div>
                {open && (
                  <ul className="pb-1 pl-8 pr-2">
                    {t.schema.map((c) => (
                      <li key={c.name} className="flex items-baseline gap-2 py-0.5 text-[11.5px]">
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
      ) : queries.length === 0 ? (
        <p className="px-3 pb-3 text-[11.5px] text-[color:var(--color-ink-4)]">None yet. Save one from the SQL editor.</p>
      ) : (
        <ul className="pb-3">
          {queries.map((q) => (
            <li key={q.id} className="group flex items-center px-3 hover:bg-[color:var(--color-surface-2)]">
              <button type="button" onClick={() => onOpenQuery(q)} title={q.sql} className="min-w-0 flex-1 truncate py-1 text-left text-[color:var(--color-ink-2)]">
                {q.name}
              </button>
              <button
                type="button"
                aria-label={`Delete query ${q.name}`}
                onClick={() => onDeleteQuery(q)}
                className="grid h-5 w-5 place-items-center rounded text-[color:var(--color-ink-4)] opacity-0 hover:text-[color:var(--color-rose-deep)] focus-visible:opacity-100 group-hover:opacity-100"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
