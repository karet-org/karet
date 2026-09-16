"use client";

// Lake folder picker: text input plus a browse popover backed by /api/lake.

import { useEffect, useRef, useState } from "react";
import { kvInputClass } from "./inspector";

export function LakeFolderField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [folders, setFolders] = useState<string[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  // List folders under the deepest complete segment of the value.
  const browsePrefix = value.includes("/") ? value.slice(0, value.lastIndexOf("/") + 1) : "";
  useEffect(() => {
    if (!open) return;
    let stale = false;
    setFolders(null);
    fetch(`/api/lake?prefix=${encodeURIComponent(browsePrefix)}`)
      .then((r) => (r.ok ? r.json() : { folders: [] }))
      .then((data: { folders?: string[] }) => {
        if (!stale) setFolders(data.folders ?? []);
      })
      .catch(() => {
        if (!stale) setFolders([]);
      });
    return () => {
      stale = true;
    };
  }, [open, browsePrefix]);

  return (
    <div ref={ref} className="relative flex gap-1.5">
      <input
        data-testid="source-container-editor-path-prefix"
        aria-label="lake folder"
        className={kvInputClass("flex-1 font-mono")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        aria-label="browse lake folders"
        onClick={() => setOpen((v) => !v)}
        className="flex-none rounded-[7px] border border-[color:var(--color-rule-soft)] px-2.5 text-[11px] text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)]"
      >
        Browse
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-10 max-h-56 w-64 overflow-y-auto rounded-[9px] border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface-2)] p-1 shadow-xl">
          {folders === null ? (
            <div className="px-2 py-1.5 text-[11.5px] text-[color:var(--color-ink-3)]">Loading…</div>
          ) : folders.length === 0 ? (
            <div className="px-2 py-1.5 text-[11.5px] text-[color:var(--color-ink-3)]">
              No folders under {browsePrefix || "the lake root"}
            </div>
          ) : (
            folders.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  onChange(f);
                }}
                className="block w-full truncate rounded-md px-2 py-1.5 text-left font-mono text-[11.5px] text-[color:var(--color-ink)] hover:bg-white/5"
              >
                {f}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default LakeFolderField;
