"use client";

// Lake bucket browser: prefix navigation and CSV upload. Uploads under
// a pipeline prefix trigger a debounced run via the store webhook.

import { useCallback, useEffect, useRef, useState } from "react";
import Modal from "@/components/ui/Modal";

interface LakeFile {
  key: string;
  size: number;
  lastModified: string | null;
}

interface Listing {
  prefix: string;
  folders: string[];
  files: LakeFile[];
  truncated: boolean;
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString();
}

const CsvIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--color-leaf)" strokeWidth="1.5" className="shrink-0" aria-hidden>
    <path d="M4 1.5h5.5L13 5v9.5H4z" />
    <path d="M9.5 1.5V5H13M6 8h4.5M6 10.5h4.5" />
  </svg>
);
const FileIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0" aria-hidden>
    <path d="M4 1.5h5.5L13 5v9.5H4z" />
    <path d="M9.5 1.5V5H13" />
  </svg>
);
const FolderIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--color-amber-deep)" strokeWidth="1.5" className="shrink-0" aria-hidden>
    <path d="M2 5.5A1.5 1.5 0 0 1 3.5 4h3l1.5 2h4.5A1.5 1.5 0 0 1 14 7.5v4A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5v-6Z" />
  </svg>
);

export default function LakeBrowser() {
  const [prefix, setPrefix] = useState("");
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async (p: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/lake?prefix=${encodeURIComponent(p)}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? body.error ?? `Listing failed (${res.status})`);
      setListing(body as Listing);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load(prefix);
  }, [prefix, load]);

  async function uploadFiles(files: FileList | File[]) {
    const list = [...files];
    if (list.length === 0) return;
    setUploading(true);
    setNotice(null);
    setError(null);
    let ok = 0;
    try {
      for (const f of list) {
        const key = `${prefix}${f.name}`;
        const res = await fetch(`/api/lake?key=${encodeURIComponent(key)}`, {
          method: "PUT",
          body: f,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message ?? body.error ?? `Upload failed (${res.status})`);
        }
        ok += 1;
      }
      setNotice(
        `Uploaded ${ok} file${ok === 1 ? "" : "s"}. CSVs under a pipeline prefix trigger a debounced run.`,
      );
      await load(prefix);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  async function doRename() {
    if (!renameTarget) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch("/api/lake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: renameTarget, to: renameValue.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? body.error ?? `Rename failed (${res.status})`);
      setRenameTarget(null);
      await load(prefix);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/lake?key=${encodeURIComponent(deleteTarget)}`, {
        method: "DELETE",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? body.error ?? `Delete failed (${res.status})`);
      setDeleteTarget(null);
      await load(prefix);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const crumbs = prefix.split("/").filter(Boolean);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
        <button
          type="button"
          onClick={() => setPrefix("")}
          className={crumbs.length === 0 ? "text-[color:var(--color-ink)]" : "text-[color:var(--color-ink-2)] hover:text-[color:var(--color-ink)]"}
        >
          lake
        </button>
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span className="text-[color:var(--color-ink-4)]">/</span>
            <button
              type="button"
              onClick={() => setPrefix(crumbs.slice(0, i + 1).join("/") + "/")}
              className={i === crumbs.length - 1 ? "text-[color:var(--color-ink)]" : "text-[color:var(--color-ink-2)] hover:text-[color:var(--color-ink)]"}
            >
              {c}
            </button>
          </span>
        ))}
        <span className="ml-auto flex items-center gap-2">
          {notice && <span className="text-[11.5px] text-[color:var(--color-leaf-deep)]">{notice}</span>}
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            data-testid="lake-upload"
            className="inline-flex items-center gap-1.5 rounded-md bg-[color:var(--color-carrot)] px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-[color:var(--color-carrot-deep)] disabled:opacity-50"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <path d="M8 11V3m0 0L5 6m3-3 3 3M2.5 13.5h11" />
            </svg>
            {uploading ? "Uploading…" : "Upload CSVs"}
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => e.target.files && uploadFiles(e.target.files)}
          />
        </span>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-[color:var(--color-rose-deep)] bg-[color:var(--color-rose-soft)] px-4 py-2.5 text-[12.5px] text-[color:var(--color-rose-deep)]">
          {error}
        </p>
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void uploadFiles(e.dataTransfer.files);
        }}
        className={`rounded-[10px] border border-dashed px-4 py-3 text-center text-[12px] transition-colors ${
          dragOver
            ? "border-[color:var(--color-carrot)] bg-[color:var(--color-carrot-soft)] text-[color:var(--color-ink)]"
            : "border-[color:var(--color-rule)] text-[color:var(--color-ink-3)]"
        }`}
      >
        Drop CSVs here to upload into{" "}
        <b className="text-[color:var(--color-ink-2)]">lake/{prefix}</b>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-[13px] border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)]">
        {!listing ? (
          <p className="px-4 py-6 text-[12.5px] text-[color:var(--color-ink-3)]">Loading…</p>
        ) : listing.folders.length === 0 && listing.files.length === 0 ? (
          <p className="grid h-full place-items-center px-4 py-10 text-[12.5px] text-[color:var(--color-ink-4)]">
            Nothing here yet. Upload CSVs to get started.
          </p>
        ) : (
          <table className="data-table min-w-full">
            <thead>
              <tr>
                <th className="w-[45%]">Name</th>
                <th>Size</th>
                <th>Modified</th>
                <th className="w-24" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {listing.folders.map((f) => {
                const name = f.slice(prefix.length).replace(/\/$/, "");
                return (
                  <tr
                    key={f}
                    onClick={() => setPrefix(f)}
                    className="cursor-pointer"
                  >
                    <td>
                      <span className="inline-flex items-center gap-2">
                        <FolderIcon />
                        {name}/
                      </span>
                    </td>
                    <td>-</td>
                    <td>-</td>
                    <td />
                  </tr>
                );
              })}
              {listing.files.map((f) => {
                const name = f.key.slice(prefix.length);
                const csv = name.toLowerCase().endsWith(".csv");
                return (
                  <tr key={f.key} className="group/row">
                    <td>
                      <span className="inline-flex items-center gap-2">
                        {csv ? <CsvIcon /> : <FileIcon />}
                        {name}
                        {!csv && (
                          <span className="text-[11px] text-[color:var(--color-ink-4)]">
                            ignored (not CSV)
                          </span>
                        )}
                      </span>
                    </td>
                    <td>{formatSize(f.size)}</td>
                    <td>{formatDate(f.lastModified)}</td>
                    <td>
                      <span className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100">
                        <a
                          href={`/api/lake/object?key=${encodeURIComponent(f.key)}`}
                          download
                          title="Download"
                          aria-label={`Download ${name}`}
                          className="grid h-8 w-8 place-items-center rounded-md text-[color:var(--color-ink-3)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-ink)]"
                        >
                          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                            <path d="M8 3v8m0 0-3-3m3 3 3-3M2.5 13.5h11" />
                          </svg>
                        </a>
                        <button
                          type="button"
                          title="Move"
                          aria-label={`Move ${name}`}
                          onClick={() => {
                            setActionError(null);
                            setRenameValue(f.key);
                            setRenameTarget(f.key);
                          }}
                          className="grid h-8 w-8 place-items-center rounded-md text-[color:var(--color-ink-3)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-ink)]"
                        >
                          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                            <path d="M2 8h9m0 0L8 5m3 3-3 3M13.5 3v10" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          aria-label={`Delete ${name}`}
                          onClick={() => {
                            setActionError(null);
                            setDeleteTarget(f.key);
                          }}
                          className="grid h-8 w-8 place-items-center rounded-md text-[color:var(--color-ink-3)] hover:bg-[color:var(--color-rose-soft)] hover:text-[color:var(--color-rose-deep)]"
                        >
                          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                            <path d="M2.5 4.5h11M6.5 4.5v-2h3v2M4 4.5l.7 9a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9l.7-9M6.5 7.5v4M9.5 7.5v4" />
                          </svg>
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {listing?.truncated && (
          <p className="border-t border-[color:var(--color-rule-soft)] px-4 py-2 text-[11.5px] text-[color:var(--color-ink-4)]">
            Listing truncated at 500 entries.
          </p>
        )}
      </div>

      {renameTarget && (
        <Modal open onClose={() => !busy && setRenameTarget(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void doRename();
            }}
          >
            <h2 className="text-lg font-semibold">Move file</h2>
            <p className="mt-1 text-xs text-[color:var(--color-ink-3)]">
              Edits the full S3 key, so this can rename in place or move
              across prefixes. A CSV under a different pipeline prefix feeds
              that pipeline instead.
            </p>
            <input
              autoFocus
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              data-testid="lake-move-input"
              className="mt-4 w-full rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-surface)] px-3 py-2 font-mono text-sm focus:border-[color:var(--color-carrot)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-carrot-soft)]"
            />
            {actionError && (
              <p role="alert" className="mt-3 text-sm text-[color:var(--color-rose-deep)]">{actionError}</p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenameTarget(null)}
                disabled={busy}
                className="rounded-md px-4 py-2 text-sm text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !renameValue.trim() || renameValue.trim() === renameTarget}
                className="rounded-md bg-[color:var(--color-carrot)] px-4 py-2 text-sm font-medium text-white hover:bg-[color:var(--color-carrot-deep)] disabled:opacity-50"
              >
                {busy ? "Moving…" : "Move"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <Modal open onClose={() => !busy && setDeleteTarget(null)}>
          <h2 className="text-lg font-semibold text-[color:var(--color-rose-deep)]">Delete file</h2>
          <p className="mt-1 text-sm text-[color:var(--color-ink-3)]">
            Permanently removes{" "}
            <code className="rounded bg-[color:var(--color-surface-2)] px-1 font-mono text-[12px]">{deleteTarget}</code>{" "}
            from the lake. Cannot be undone.
          </p>
          {actionError && (
            <p role="alert" className="mt-3 text-sm text-[color:var(--color-rose-deep)]">{actionError}</p>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              disabled={busy}
              className="rounded-md px-4 py-2 text-sm text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void doDelete()}
              disabled={busy}
              data-testid="lake-delete-confirm"
              className="rounded-md bg-[color:var(--color-rose-deep)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Deleting…" : "Delete file"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
