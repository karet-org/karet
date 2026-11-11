"use client";

// Side panel with the full value of the selected grid cell.

import { useState } from "react";
import { cellDetail } from "@/lib/data/grid";
import { ghostButtonClass } from "@/components/ui/controls";

export default function CellViewer({
  column,
  type,
  value,
  onClose,
}: {
  column: string;
  type?: string;
  value: unknown;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const text = cellDetail(value);

  const copy = async () => {
    await navigator.clipboard.writeText(text ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <aside
      data-testid="cell-viewer"
      className="flex w-full shrink-0 flex-col border-t border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface)] md:w-[300px] md:border-l md:border-t-0"
    >
      <div className="flex items-center gap-2 border-b border-[color:var(--color-rule-soft)] px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-semibold text-[color:var(--color-ink)]">{column}</div>
          {type && <div className="text-[11px] text-[color:var(--color-ink-4)]">{type.toLowerCase()}</div>}
        </div>
        <button type="button" onClick={() => void copy()} disabled={text === null} className={ghostButtonClass()}>
          {copied ? "Copied" : "Copy"}
        </button>
        <button type="button" onClick={onClose} aria-label="Close value panel" className={ghostButtonClass()}>
          ✕
        </button>
      </div>
      <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-all px-3 py-2 font-mono text-[12px] text-[color:var(--color-ink-2)]">
        {text === null ? <span className="text-[color:var(--color-ink-4)]">NULL</span> : text}
      </pre>
    </aside>
  );
}
