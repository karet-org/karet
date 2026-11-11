"use client";

// Config history: every saved version with what it changed, and a way back.
// The list is on the left; the selected version's diff is on the right, either
// against the version before it or against the live config.
//
// Restoring writes the old config forward as a new version rather than winding
// history back, so the trail stays append-only.

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Modal from "@/components/ui/Modal";
import { useCanHere } from "@/lib/client/use-current-user";
import { ghostButtonClass, primaryButtonClass } from "@/components/ui/controls";
import { toolSecondary } from "@/components/data/toolbar";
import { ageLabel } from "@/lib/data/navigator";
import type { UnifiedDiff } from "@/lib/config/text-diff";

interface VersionRow {
  version: number;
  saved_at: string;
  author: string;
  note?: string;
  live: boolean;
  /** Sentences from the version before; null for the first version. */
  changes: string[] | null;
}

type Against = "previous" | "live";

interface VersionDetail {
  version: number;
  live: boolean;
  liveVersion: number | null;
  previousVersion: number | null;
  against: Against;
  diff: UnifiedDiff;
}

const SHOWN_CHANGES = 3;

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function noteText(note: string | undefined): string | null {
  if (!note) return null;
  if (note === "created") return "Created the pipeline";
  const reverted = /^reverted to v(\d+)$/.exec(note);
  return reverted ? `Restored v${reverted[1]}` : note;
}

function LiveBadge() {
  return (
    <span className="rounded bg-[color:var(--color-carrot-soft)] px-1 text-[10.5px] font-medium text-[color:var(--color-carrot)]">
      live
    </span>
  );
}

function DiffView({ diff }: { diff: UnifiedDiff }) {
  return (
    <div className="overflow-x-auto rounded border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)]" data-testid="history-diff">
      <div className="flex gap-2 border-b border-[color:var(--color-rule-soft)] px-3 py-1 font-mono text-[11.5px]">
        <span className="text-[color:var(--color-leaf)]">+{diff.additions}</span>
        <span className="text-[color:var(--color-rose-deep)]">−{diff.deletions}</span>
      </div>
      {diff.hunks.map((hunk, hi) => (
        <div key={hi} className="border-b border-[color:var(--color-rule-soft)] last:border-b-0">
          <div className="px-3 py-1 font-mono text-[11px] text-[color:var(--color-ink-4)]">{hunk.header}</div>
          <pre className="m-0 whitespace-pre pb-1 font-mono text-[11.5px] leading-[1.55]">
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
                <span className="select-none pr-2 text-[color:var(--color-ink-4)]">
                  {line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " "}
                </span>
                {line.text}
              </div>
            ))}
          </pre>
        </div>
      ))}
    </div>
  );
}

export default function HistoryPage() {
  const { pipeline } = useParams<{ pipeline: string }>();
  const canEdit = useCanHere(pipeline, "editor");
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [current, setCurrent] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [against, setAgainst] = useState<Against>("previous");
  const [detail, setDetail] = useState<VersionDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [revertTarget, setRevertTarget] = useState<number | null>(null);
  const [reverting, setReverting] = useState(false);
  const [revertError, setRevertError] = useState<string | null>(null);
  const detailRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/p/${pipeline}/config/history`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`);
      const list: VersionRow[] = body.versions ?? [];
      setVersions(list);
      setCurrent(body.current ?? null);
      setSelected((s) => (s !== null && list.some((v) => v.version === s) ? s : (list[0]?.version ?? null)));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [pipeline]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (selected === null) return;
    let cancelled = false;
    setDetailError(null);
    fetch(`/api/p/${pipeline}/config/history/${selected}?against=${against}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`);
        if (!cancelled) setDetail(body);
      })
      .catch((err) => !cancelled && setDetailError((err as Error).message));
    return () => {
      cancelled = true;
    };
  }, [pipeline, selected, against, current]);

  async function confirmRevert() {
    if (revertTarget === null) return;
    setReverting(true);
    setRevertError(null);
    try {
      const res = await fetch(`/api/p/${pipeline}/config/history/${revertTarget}/revert`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setRevertTarget(null);
      setSelected(body.version ?? null);
      setAgainst("previous");
      await load();
    } catch (err) {
      setRevertError((err as Error).message);
    } finally {
      setReverting(false);
    }
  }

  const row = versions.find((v) => v.version === selected) ?? null;
  const shownDetail = detail && detail.version === selected && detail.against === against ? detail : null;

  return (
    <div className="flex flex-col md:h-full">
      <header className="flex h-12 shrink-0 items-center border-b border-[color:var(--color-rule-soft)] px-4">
        <h1 className="text-[15px] font-semibold text-[color:var(--color-ink)]">History</h1>
        {!loading && versions.length > 0 && (
          <span className="ml-2 text-[12px] text-[color:var(--color-ink-4)]">
            {versions.length} version{versions.length === 1 ? "" : "s"}
          </span>
        )}
      </header>

      {error ? (
        <p role="alert" className="m-4 rounded-md border border-[color:var(--color-rose-deep)] bg-[color:var(--color-rose-soft)] px-4 py-3 text-sm text-[color:var(--color-rose-deep)]">
          {error}
        </p>
      ) : loading ? (
        <p className="p-4 text-[12.5px] text-[color:var(--color-ink-3)]">Loading…</p>
      ) : versions.length === 0 ? (
        <p className="p-4 text-[12.5px] text-[color:var(--color-ink-3)]">No saved versions yet.</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <ol
            className="shrink-0 border-b border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)] md:w-[340px] md:overflow-y-auto md:border-b-0 md:border-r"
            data-testid="history-table"
            aria-label="Versions"
          >
            {versions.map((v) => {
              const note = noteText(v.note);
              const changes = v.changes ?? [];
              return (
                <li key={v.version} className="border-b border-[color:var(--color-rule-soft)]">
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(v.version);
                      if (window.matchMedia("(max-width: 767px)").matches) {
                        requestAnimationFrame(() => detailRef.current?.scrollIntoView({ block: "start" }));
                      }
                    }}
                    aria-current={selected === v.version ? "true" : undefined}
                    data-testid={`history-v${v.version}`}
                    className={`block w-full px-3 py-2 text-left ${
                      selected === v.version
                        ? "bg-[color:var(--color-surface-2)]"
                        : "hover:bg-[color:var(--color-surface-2)]/60"
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-[12.5px]">
                      <span className="font-medium text-[color:var(--color-ink)]">v{v.version}</span>
                      {v.version === current && <LiveBadge />}
                      <span className="truncate text-[color:var(--color-ink-3)]">{v.author}</span>
                      <span className="ml-auto shrink-0 text-[11.5px] text-[color:var(--color-ink-4)]" title={when(v.saved_at)}>
                        {ageLabel(v.saved_at)}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[12px] leading-[1.45] text-[color:var(--color-ink-3)]">
                      {note && <span className="block text-[color:var(--color-ink-2)]">{note}</span>}
                      {changes.slice(0, SHOWN_CHANGES).map((c) => (
                        <span key={c} className="block truncate">
                          {c}
                        </span>
                      ))}
                      {changes.length > SHOWN_CHANGES && (
                        <span className="block text-[color:var(--color-ink-4)]">
                          {changes.length - SHOWN_CHANGES} more
                        </span>
                      )}
                      {v.changes !== null && changes.length === 0 && !note && (
                        <span className="block text-[color:var(--color-ink-4)]">Only node positions changed</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          <section ref={detailRef} className="min-h-[320px] min-w-0 flex-1 md:overflow-y-auto" aria-label="Selected version">
            {row && (
              <>
                <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-[color:var(--color-rule-soft)] px-4 py-1.5">
                  <span className="flex items-center gap-1.5 text-[13px]">
                    <span className="font-semibold text-[color:var(--color-ink)]">v{row.version}</span>
                    {row.version === current && <LiveBadge />}
                  </span>
                  <span className="text-[12px] text-[color:var(--color-ink-3)]">
                    {row.author}, {when(row.saved_at)}
                  </span>
                  <span className="ml-auto flex items-center gap-1.5">
                    <span role="group" aria-label="Compare with" className="flex rounded border border-[color:var(--color-rule)] p-0.5">
                      {(["previous", "live"] as const).map((a) => (
                        <button
                          key={a}
                          type="button"
                          aria-pressed={against === a}
                          onClick={() => setAgainst(a)}
                          data-testid={`against-${a}`}
                          className={`h-6 rounded-sm px-2 text-[11.5px] font-medium ${
                            against === a
                              ? "bg-[color:var(--color-surface-2)] text-[color:var(--color-ink)]"
                              : "text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)]"
                          }`}
                        >
                          {a === "previous" ? "This save" : "Against live"}
                        </button>
                      ))}
                    </span>
                    {canEdit && row.version !== current && (
                      <button
                        type="button"
                        onClick={() => {
                          setRevertError(null);
                          setRevertTarget(row.version);
                        }}
                        data-testid={`revert-v${row.version}`}
                        className={toolSecondary()}
                      >
                        Restore
                      </button>
                    )}
                  </span>
                </div>

                <div className="space-y-3 px-4 py-3">
                  {detailError ? (
                    <p role="alert" className="text-[12.5px] text-[color:var(--color-rose-deep)]">
                      {detailError}
                    </p>
                  ) : !shownDetail ? (
                    <p className="text-[12.5px] text-[color:var(--color-ink-4)]">Loading…</p>
                  ) : against === "previous" && shownDetail.previousVersion === null ? (
                    <p className="text-[12.5px] text-[color:var(--color-ink-3)]">The first version. There is nothing before it to compare with.</p>
                  ) : (
                    <>
                      {against === "previous" && row.changes && row.changes.length > 0 && (
                        <ul className="space-y-0.5 text-[12.5px] text-[color:var(--color-ink-2)]" data-testid="history-changes">
                          {row.changes.map((c) => (
                            <li key={c}>{c}</li>
                          ))}
                        </ul>
                      )}
                      <p className="text-[12px] text-[color:var(--color-ink-4)]">
                        {against === "previous"
                          ? `Compared with v${shownDetail.previousVersion}. Node positions are left out.`
                          : shownDetail.live
                            ? "This is the live config."
                            : `What restoring v${row.version} would change in the live config (v${shownDetail.liveVersion ?? "?"}). Node positions are left out.`}
                      </p>
                      {shownDetail.diff.identical ? (
                        <p className="text-[12.5px] text-[color:var(--color-ink-2)]">No differences.</p>
                      ) : (
                        <DiffView diff={shownDetail.diff} />
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      <Modal open={revertTarget !== null} onClose={() => !reverting && setRevertTarget(null)}>
        <h2 className="text-[15px] font-semibold text-[color:var(--color-ink)]">Restore v{revertTarget}?</h2>
        <p className="mt-2 text-[13px] text-[color:var(--color-ink-2)]">
          v{revertTarget} is saved as a new version and becomes live. The current version stays in the history.
        </p>
        {revertError && <p className="mt-2 text-[12px] text-[color:var(--color-rose-deep)]">{revertError}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => setRevertTarget(null)} disabled={reverting} className={ghostButtonClass()}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void confirmRevert()}
            disabled={reverting}
            data-testid="confirm-revert"
            className={primaryButtonClass()}
          >
            {reverting ? "Restoring…" : "Restore"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
