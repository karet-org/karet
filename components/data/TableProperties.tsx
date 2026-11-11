"use client";

// The Properties tab of one table: a summary, the columns, where the rows
// come from, and the retained versions with restore.

import { useCallback, useEffect, useState } from "react";
import type { TableInfo } from "./types";
import type { PipelineConfig } from "@/lib/types/config";
import { ageLabel } from "@/lib/data/navigator";
import { formatBytes, tableSources, type TableSource } from "@/lib/data/properties";
import { IconCopy } from "@/components/icons";
import { toolButton, toolSecondary } from "./toolbar";

interface TableVersion {
  version: number;
  created_at: string;
  files: number;
  bytes: number;
  live: boolean;
}

const heading = "text-[10.5px] font-medium uppercase tracking-[0.06em] text-[color:var(--color-ink-4)]";

function dateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function KeyBadge({ kind }: { kind: "partition" | "dedup" }) {
  return (
    <span
      title={kind === "partition" ? "Partition key" : "Dedup key"}
      className={`rounded border px-1 text-[10.5px] leading-4 ${
        kind === "partition"
          ? "border-[color:var(--color-carrot)]/40 text-[color:var(--color-carrot)]"
          : "border-[color:var(--color-leaf-deep)]/40 text-[color:var(--color-leaf-deep)]"
      }`}
    >
      {kind}
    </span>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      aria-label={label}
      title={label}
      className={toolButton("h-6 px-1.5 text-[11px]")}
    >
      {copied ? "Copied" : <IconCopy size={12} />}
    </button>
  );
}

export default function TableProperties({
  pipeline,
  table,
  canEdit,
  onRestored,
}: {
  pipeline: string;
  table: TableInfo;
  canEdit: boolean;
  onRestored: () => void;
}) {
  const [versions, setVersions] = useState<TableVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [sources, setSources] = useState<TableSource[] | null>(null);

  const loadVersions = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/p/${pipeline}/tables/${table.id}/versions`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`);
      setVersions(body.versions ?? []);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [pipeline, table.id]);

  useEffect(() => {
    void loadVersions();
  }, [loadVersions]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/p/${pipeline}/config`)
      .then((res) => (res.ok ? (res.json() as Promise<PipelineConfig>) : null))
      .then((config) => {
        if (!cancelled) setSources(config ? tableSources(config, table.id) : []);
      })
      .catch(() => !cancelled && setSources([]));
    return () => {
      cancelled = true;
    };
  }, [pipeline, table.id]);

  const restore = async (version: number) => {
    setRestoring(version);
    try {
      const res = await fetch(`/api/p/${pipeline}/tables/${table.id}/versions/${version}/restore`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`);
      await loadVersions();
      onRestored();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRestoring(null);
    }
  };

  const published = table.version > 0;
  const live = versions?.find((v) => v.live);
  const restorable = canEdit && (versions ?? []).some((v) => !v.live);
  const age = ageLabel(table.publishedAt);
  const stats: [string, string][] = [
    ["Rows", !published ? "0" : table.rowCount === null ? "Unknown" : table.rowCount.toLocaleString()],
    ["Size", live ? formatBytes(live.bytes) : published ? "…" : "0 B"],
    ["Files", String(table.fileCount)],
    ["Columns", String(table.schema.length)],
  ];

  return (
    <div className="min-h-0 flex-1 overflow-auto" data-testid="table-properties">
      <div className="max-w-[1180px] px-3 py-3">
        <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-[15px] font-semibold text-[color:var(--color-ink)]">{table.name}</h2>
          <span className="text-[12px] text-[color:var(--color-ink-3)]" data-testid="table-published">
            {published ? (
              <>
                v{table.version}
                {table.publishedAt && (
                  <span title={dateTime(table.publishedAt)}>, published {age}</span>
                )}
              </>
            ) : (
              "Not published yet"
            )}
          </span>
        </header>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[color:var(--color-ink-3)]">
          <span className="flex items-center gap-1">
            In SQL
            <code className="font-mono text-[12px] text-[color:var(--color-ink)]">{table.slug}</code>
            <CopyButton text={table.slug} label="Copy the SQL name" />
          </span>
          {table.id !== table.slug && (
            <span className="flex items-center gap-1.5">
              Id <code className="font-mono text-[12px] text-[color:var(--color-ink-2)]">{table.id}</code>
            </span>
          )}
        </div>
        {table.collidesWith && (
          <p className="mt-2 text-[12px] text-[color:var(--color-amber-deep)]">
            This table&apos;s SQL name collides with another table&apos;s; rename one to query it by name.
          </p>
        )}

        <dl className="mt-3 grid grid-cols-2 overflow-hidden rounded border border-[color:var(--color-rule-soft)] sm:grid-cols-4" data-testid="table-stats">
          {stats.map(([k, v], i) => (
            <div
              key={k}
              className={`px-3 py-2 ${i > 0 ? "border-l border-[color:var(--color-rule-soft)]" : ""} ${
                i === 2 ? "max-sm:border-l-0 max-sm:border-t" : i === 3 ? "max-sm:border-t" : ""
              }`}
            >
              <dt className={heading}>{k}</dt>
              <dd className="mt-0.5 text-[15px] tabular-nums text-[color:var(--color-ink)]">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-5 grid gap-x-6 gap-y-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <section aria-label="Columns">
            <h3 className={heading}>Columns</h3>
            <div className="mt-1.5 overflow-x-auto rounded border border-[color:var(--color-rule-soft)]">
              <table className="result-grid props-grid" data-testid="table-columns">
                <thead>
                  <tr>
                    <th className="w-8 text-right">#</th>
                    <th>Column</th>
                    <th title="The type in the pipeline config. The Data tab shows the type DuckDB reads.">Type</th>
                    <th>Key</th>
                  </tr>
                </thead>
                <tbody>
                  {table.schema.map((c, i) => (
                    <tr key={c.name}>
                      <td className="text-right tabular-nums text-[color:var(--color-ink-4)]">{i + 1}</td>
                      <td className="text-[color:var(--color-ink)]">{c.name}</td>
                      <td className="font-mono text-[11.5px]">{c.type}</td>
                      <td>
                        <span className="flex gap-1">
                          {table.partitionKeys.includes(c.name) && <KeyBadge kind="partition" />}
                          {table.dedupKeys.includes(c.name) && <KeyBadge kind="dedup" />}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="space-y-5">
            <section aria-label="Details">
              <h3 className={heading}>Details</h3>
              <dl className="mt-1.5 grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[12.5px]" data-testid="table-details">
                <dt className="text-[color:var(--color-ink-3)]">Partition keys</dt>
                <dd className="text-[color:var(--color-ink)]">{table.partitionKeys.length ? table.partitionKeys.join(", ") : "None"}</dd>
                <dt className="text-[color:var(--color-ink-3)]" title="Rows with the same values in these columns are kept once.">
                  Dedup keys
                </dt>
                <dd className="text-[color:var(--color-ink)]">{table.dedupKeys.length ? table.dedupKeys.join(", ") : "None"}</dd>
                <dt className="text-[color:var(--color-ink-3)]">Written by</dt>
                <dd className="text-[color:var(--color-ink)]" data-testid="table-sources">
                  {sources === null ? (
                    <span className="text-[color:var(--color-ink-4)]">Loading…</span>
                  ) : sources.length === 0 ? (
                    <span className="text-[color:var(--color-ink-4)]">No mapping writes into this table.</span>
                  ) : (
                    <ul className="space-y-0.5">
                      {sources.map((s) => (
                        <li key={s.mapping}>
                          {s.mapping}
                          <span className="text-[color:var(--color-ink-3)]">
                            {" "}
                            from {s.source}
                            {s.filtered ? ", with a row filter" : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </dd>
              </dl>
            </section>

            <section aria-label="Versions">
              <h3 className={heading}>Versions</h3>
              <p className="mt-1 text-[12px] text-[color:var(--color-ink-3)]">
                Snapshots the worker still keeps. Restoring one makes it live again; no data is copied.
              </p>
              {error ? (
                <p className="mt-2 text-[12px] text-[color:var(--color-rose-deep)]" role="alert">
                  {error}
                </p>
              ) : versions === null ? (
                <p className="mt-2 text-[12px] text-[color:var(--color-ink-4)]">Loading…</p>
              ) : versions.length === 0 ? (
                <p className="mt-2 text-[12px] text-[color:var(--color-ink-4)]">No published versions yet.</p>
              ) : (
                <div className="mt-1.5 overflow-x-auto rounded border border-[color:var(--color-rule-soft)]">
                  <table className="result-grid props-grid" data-testid="table-versions">
                    <thead>
                      <tr>
                        <th>Version</th>
                        <th>Published</th>
                        <th className="text-right">Files</th>
                        <th className="text-right">Size</th>
                        {restorable && <th aria-label="Actions" />}
                      </tr>
                    </thead>
                    <tbody>
                      {versions.map((v) => (
                        <tr key={v.version}>
                          <td>
                            <span className="flex items-center gap-1.5 text-[color:var(--color-ink)]">
                              v{v.version}
                              {v.live && (
                                <span className="rounded bg-[color:var(--color-carrot-soft)] px-1 text-[10.5px] font-medium text-[color:var(--color-carrot)]">
                                  live
                                </span>
                              )}
                            </span>
                          </td>
                          <td title={ageLabel(v.created_at) ?? undefined}>{dateTime(v.created_at)}</td>
                          <td className="text-right tabular-nums">{v.files}</td>
                          <td className="text-right tabular-nums">{formatBytes(v.bytes)}</td>
                          {restorable && (
                            <td className="w-0 py-0 text-right">
                              {!v.live && (
                                <button
                                  type="button"
                                  onClick={() => void restore(v.version)}
                                  disabled={restoring !== null}
                                  data-testid={`restore-table-v${v.version}`}
                                  className={toolSecondary("h-6 px-2 text-[11.5px]")}
                                >
                                  {restoring === v.version ? "Restoring…" : "Restore"}
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
