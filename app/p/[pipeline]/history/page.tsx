"use client";

// Config history: who changed this pipeline, when, and a way back.
//
// Inspecting a version shows how it differs from the live config, which is the
// question worth answering: "what would change if I restored this". Diffs
// between adjacent versions are not shown — they cost a read per version and
// answer a question nobody asks.
//
// Reverting writes the old config forward as a new version rather than winding
// history back, so the trail stays append-only.

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Modal from "@/components/ui/Modal";
import { useCan } from "@/lib/client/use-current-user";
import { ghostButtonClass, primaryButtonClass } from "@/components/ui/controls";
import type { UnifiedDiff } from "@/lib/config/text-diff";

interface VersionRow {
  version: number;
  saved_at: string;
  author: string;
  note?: string;
  live: boolean;
}

interface VersionDetail {
  version: number;
  saved_at: string;
  author: string;
  note?: string;
  live: boolean;
  liveVersion: number | null;
  diff: UnifiedDiff;
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}


export default function HistoryPage() {
  const { pipeline } = useParams<{ pipeline: string }>();
  const canEdit = useCan("editor");
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [current, setCurrent] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<VersionDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [revertTarget, setRevertTarget] = useState<number | null>(null);
  const [reverting, setReverting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/p/${pipeline}/config/history`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`);
      setVersions(body.versions ?? []);
      setCurrent(body.current ?? null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [pipeline]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(version: number) {
    setDetail(null);
    setDetailError(null);
    try {
      const res = await fetch(`/api/p/${pipeline}/config/history/${version}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`);
      setDetail(body);
    } catch (err) {
      setDetailError((err as Error).message);
    }
  }

  async function confirmRevert() {
    if (revertTarget === null) return;
    setReverting(true);
    try {
      const res = await fetch(`/api/p/${pipeline}/config/history/${revertTarget}/revert`, {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setRevertTarget(null);
      setDetail(null);
      await load();
    } catch (err) {
      setDetailError((err as Error).message);
    } finally {
      setReverting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <h1 className="text-[19px] font-semibold tracking-[-0.01em] text-[color:var(--color-ink)]">
        History
      </h1>
      <p className="mt-1 text-[13px] text-[color:var(--color-ink-3)]">
        Every saved version of this config, newest first. Inspect one to see how it
        differs from the live version.
      </p>

      {error ? (
        <div
          role="alert"
          className="mt-6 rounded-md border border-[color:var(--color-rose-deep)] bg-[color:var(--color-rose-soft)] px-4 py-3 text-sm text-[color:var(--color-rose-deep)]"
        >
          {error}
        </div>
      ) : loading ? (
        <p className="mt-6 text-sm text-[color:var(--color-ink-3)]">Loading…</p>
      ) : versions.length === 0 ? (
        <p className="mt-6 text-sm text-[color:var(--color-ink-3)]">
          No saved versions yet. The next save through the editor or the API records one.
        </p>
      ) : (
        <table className="mt-6 w-full border-collapse text-sm" data-testid="history-table">
          <thead>
            <tr className="border-b border-[color:var(--color-rule)] text-left text-[11.5px] uppercase tracking-[0.05em] text-[color:var(--color-ink-3)]">
              <th className="py-2 pr-3 font-medium">Version</th>
              <th className="py-2 pr-3 font-medium">Saved</th>
              <th className="py-2 pr-3 font-medium">Author</th>
              <th className="py-2 pr-3 font-medium">Note</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr
                key={v.version}
                className="border-b border-[color:var(--color-rule-soft)] text-[color:var(--color-ink-2)]"
              >
                <td className="py-2 pr-3 font-medium text-[color:var(--color-ink)]">
                  v{v.version}
                  {v.version === current && (
                    <span className="ml-2 rounded border border-[color:var(--color-rule)] px-1.5 py-0.5 text-[10.5px] font-medium text-[color:var(--color-ink-3)]">
                      live
                    </span>
                  )}
                </td>
                <td className="py-2 pr-3 whitespace-nowrap">{when(v.saved_at)}</td>
                <td className="py-2 pr-3">{v.author}</td>
                <td className="py-2 pr-3 text-[color:var(--color-ink-3)]">
                  {v.note ?? ""}
                </td>
                <td className="py-2 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => void openDetail(v.version)}
                    className={ghostButtonClass()}
                  >
                    Inspect
                  </button>
                  {canEdit && v.version === current && (
                    <span className="ml-1 inline-block px-2 py-1 text-xs text-[color:var(--color-ink-4)]">
                      in use
                    </span>
                  )}
                  {canEdit && v.version !== current && (
                    <button
                      type="button"
                      onClick={() => setRevertTarget(v.version)}
                      data-testid={`revert-v${v.version}`}
                      className={ghostButtonClass("ml-1")}
                    >
                      Restore
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal
        open={detail !== null || detailError !== null}
        onClose={() => { setDetail(null); setDetailError(null); }}
        // The default card is max-w-md, too narrow for a config dump.
        cardClassName="w-full max-w-3xl rounded-xl bg-[color:var(--color-surface)] p-6 text-[color:var(--color-ink)] shadow-xl"
      >
        {detailError ? (
          <p className="text-sm text-[color:var(--color-rose-deep)]">{detailError}</p>
        ) : detail ? (
          <div className="max-h-[70vh] overflow-auto">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-[15px] font-semibold text-[color:var(--color-ink)]">
                v{detail.version}, saved by {detail.author} on {when(detail.saved_at)}
              </h2>
              {!detail.diff.identical && (
                <span className="font-mono text-[12px]">
                  <span className="text-[color:var(--color-leaf)]">+{detail.diff.additions}</span>
                  {" "}
                  <span className="text-[color:var(--color-rose-deep)]">−{detail.diff.deletions}</span>
                </span>
              )}
            </div>
            <p className="mt-1 text-[12.5px] text-[color:var(--color-ink-3)]">
              {detail.live
                ? "This is the live config."
                : `Changes restoring this would make to the live config (v${detail.liveVersion ?? "?"}). Node positions are ignored.`}
            </p>

            {detail.diff.identical ? (
              <p className="mt-3 text-sm text-[color:var(--color-ink-2)]">
                No differences from the live config.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-surface-2)]">
                {detail.diff.hunks.map((hunk, hi) => (
                  <div key={hi} className="border-b border-[color:var(--color-rule-soft)] last:border-b-0">
                    <div className="bg-[color:var(--color-surface)] px-3 py-1 font-mono text-[11px] text-[color:var(--color-ink-3)]">
                      {hunk.header}
                    </div>
                    <pre className="m-0 whitespace-pre px-0 py-1 font-mono text-[11.5px] leading-[1.55]">
                      {hunk.lines.map((line, li) => (
                        <div
                          key={li}
                          className={
                            "px-3 " +
                            (line.kind === "added"
                              ? "bg-[color:var(--color-leaf-soft)] text-[color:var(--color-ink)]"
                              : line.kind === "removed"
                                ? "bg-[color:var(--color-rose-soft)] text-[color:var(--color-ink)]"
                                : "text-[color:var(--color-ink-3)]")
                          }
                        >
                          <span className="select-none pr-2 text-[color:var(--color-ink-3)]">
                            {line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " "}
                          </span>
                          {line.text}
                        </div>
                      ))}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal open={revertTarget !== null} onClose={() => setRevertTarget(null)}>
        <div className="w-[min(28rem,80vw)]">
          <h2 className="text-[15px] font-semibold text-[color:var(--color-ink)]">
            Restore v{revertTarget}?
          </h2>
          <p className="mt-2 text-[13px] text-[color:var(--color-ink-2)]">
            v{revertTarget} becomes the live config, and the current one stays in
            history.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRevertTarget(null)}
              className={ghostButtonClass("px-3 py-1.5 text-sm")}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void confirmRevert()}
              disabled={reverting}
              data-testid="confirm-revert"
              className={primaryButtonClass("text-sm")}
            >
              {reverting ? "Restoring…" : "Restore"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
