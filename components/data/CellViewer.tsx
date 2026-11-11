"use client";

// Side panel with the full value of the selected grid cell.

import { useState } from "react";
import { cellDetail } from "@/lib/data/grid";
import { IconClose, IconCopy } from "@/components/icons";
import { iconButton, toolButton } from "./toolbar";

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
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-[color:var(--color-rule-soft)] pl-3 pr-1.5">
        <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span className="truncate text-[12.5px] font-semibold text-[color:var(--color-ink)]">{column}</span>
          {type && <span className="shrink-0 text-[11px] text-[color:var(--color-ink-4)]">{type.toLowerCase()}</span>}
        </div>
        <button type="button" onClick={() => void copy()} disabled={text === null} className={toolButton()}>
          <IconCopy size={13} />
          {copied ? "Copied" : "Copy"}
        </button>
        <button type="button" onClick={onClose} aria-label="Close value panel" title="Close" className={iconButton()}>
          <IconClose size={14} />
        </button>
      </div>
      <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-all px-3 py-2 font-mono text-[12px] text-[color:var(--color-ink-2)]">
        {text === null ? <span className="text-[color:var(--color-ink-4)]">NULL</span> : text}
      </pre>
    </aside>
  );
}
