"use client";

// The Properties tab of one table: identifiers, keys, columns, and the
// retained versions with restore.

import { useCallback, useEffect, useState } from "react";
import type { TableInfo } from "./types";
import { ghostButtonClass } from "@/components/ui/controls";

interface TableVersion {
  version: number;
  created_at: string;
  files: number;
  bytes: number;
  live: boolean;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
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

  const live = versions?.find((v) => v.live);
  const facts: [string, React.ReactNode][] = [
    ["Name", table.name],
    ["Id", <code key="id">{table.id}</code>],
    ["In SQL", <code key="slug">{table.slug}</code>],
    ["Live version", table.version > 0 ? `v${table.version}` : "Not published yet"],
    ["Files", table.fileCount],
    ["Size", live ? formatBytes(live.bytes) : "-"],
    ["Partition keys", table.partitionKeys.length ? table.partitionKeys.join(", ") : "None"],
    ["Dedup keys", table.dedupKeys.length ? table.dedupKeys.join(", ") : "None"],
  ];

  return (
    <div className="min-h-0 flex-1 overflow-auto px-4 py-4" data-testid="table-properties">
      <dl className="grid max-w-xl grid-cols-[9rem_1fr] gap-x-4 gap-y-1.5 text-[12.5px]">
        {facts.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-[color:var(--color-ink-3)]">{k}</dt>
            <dd className="text-[color:var(--color-ink)]">{v}</dd>
          </div>
        ))}
      </dl>
      {table.collidesWith && (
        <p className="mt-3 text-[12px] text-[color:var(--color-amber-deep)]">
          This table&apos;s SQL name collides with another table&apos;s; rename one to query it by name.
        </p>
      )}

      <h3 className="mt-6 text-[12.5px] font-semibold text-[color:var(--color-ink)]">Columns</h3>
      <table className="data-table mt-2 max-w-xl">
        <thead>
          <tr>
            <th>Column</th>
            <th title="The type in the pipeline config. The Data tab shows the type DuckDB reads.">Declared type</th>
            <th>Key</th>
          </tr>
        </thead>
        <tbody>
          {table.schema.map((c) => (
            <tr key={c.name}>
              <td>{c.name}</td>
              <td>{c.type}</td>
              <td className="text-[color:var(--color-ink-3)]">
                {[table.partitionKeys.includes(c.name) && "partition", table.dedupKeys.includes(c.name) && "dedup"]
                  .filter(Boolean)
                  .join(", ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="mt-6 text-[12.5px] font-semibold text-[color:var(--color-ink)]">Versions</h3>
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
        <table className="data-table mt-2 max-w-2xl" data-testid="table-versions">
          <thead>
            <tr>
              <th>Version</th>
              <th>Published</th>
              <th>Files</th>
              <th>Size</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.version}>
                <td>
                  v{v.version}
                  {v.live && (
                    <span className="ml-2 rounded border border-[color:var(--color-rule)] px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--color-ink-3)]">
                      live
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap">{new Date(v.created_at).toLocaleString()}</td>
                <td>{v.files}</td>
                <td>{formatBytes(v.bytes)}</td>
                <td className="text-right">
                  {canEdit && !v.live && (
                    <button
                      type="button"
                      onClick={() => void restore(v.version)}
                      disabled={restoring !== null}
                      data-testid={`restore-table-v${v.version}`}
                      className={ghostButtonClass()}
                    >
                      {restoring === v.version ? "Restoring…" : "Restore"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
