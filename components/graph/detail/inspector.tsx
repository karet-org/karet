// Display-first inspector primitives shared by the four node editors.
//
// The inspector renders quiet key-value sections by default; editing
// chrome (chips, inline edit rows, inputs) appears only on interaction.
// Visual language follows the approved redesign mock.

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Section: quiet label row (optional action button) over content. */
export function Section({
  label,
  action,
  children,
  last,
}: {
  label: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={
        last
          ? "pb-1"
          : "mb-3.5 border-b border-[color:var(--color-rule-soft)] pb-3.5"
      }
    >
      <div className="mb-2 flex items-center justify-between text-[11px] tracking-[0.3px] text-[color:var(--color-ink-3)]">
        <span className="flex items-center gap-1.5">{label}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

/** Quiet key-value row: label left, emphasized value right. */
export function InspRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-[3px] text-xs text-[color:var(--color-ink-2)]">
      <span className="min-w-0 truncate">{label}</span>
      <span className="min-w-0 truncate text-right font-medium text-[color:var(--color-ink)]">
        {children}
      </span>
    </div>
  );
}

/** Small icon button living in a section's label row. */
export function LabelButton({
  title,
  onClick,
  active,
  children,
  testId,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      data-testid={testId}
      onClick={onClick}
      className={`-my-1 grid h-5 w-5 place-items-center rounded-md ${
        active
          ? "text-[color:var(--color-carrot)]"
          : "text-[color:var(--color-ink-3)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-ink)]"
      }`}
    >
      {children}
    </button>
  );
}

export function PencilIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M11.5 2.5l2 2L5 13l-2.7.7L3 11l8.5-8.5z" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M3 4h10M6.5 4V2.5h3V4M5 4l.6 9h4.8L11 4" />
    </svg>
  );
}

export function XIcon({ size = 9 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

/** Flat input in the inspector body (mock's kv-input). */
export function kvInputClass(extra = ""): string {
  return `w-full rounded-[7px] border border-transparent bg-[color:var(--color-surface-2)] px-2.5 py-[7px] text-xs text-[color:var(--color-ink)] focus:border-[color:var(--color-carrot)] focus:outline-none ${extra}`;
}

/** Input inside an editing card (needs its own ground to stay visible). */
export function editInputClass(extra = ""): string {
  return `w-full rounded-[7px] border border-[color:var(--color-rule-soft)] bg-[color:var(--color-bg)] px-2 py-[5px] text-xs text-[color:var(--color-ink)] focus:border-[color:var(--color-carrot)] focus:outline-none ${extra}`;
}

/** Labeled field inside an editing card. */
export function EditField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-[3px] ${className ?? ""}`}>
      <span className="pl-px text-[9.5px] tracking-[0.3px] text-[color:var(--color-ink-3)]">
        {label}
      </span>
      {children}
    </label>
  );
}

/** Small on/off switch (not-null toggles). */
export function Switch({
  on,
  onToggle,
  title,
}: {
  on: boolean;
  onToggle: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={title}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`relative h-[13px] w-6 flex-none rounded-full border transition-colors ${
        on
          ? "border-transparent bg-[color:var(--color-carrot-soft)]"
          : "border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface-2)]"
      }`}
    >
      <span
        className={`absolute top-[1.5px] h-2 w-2 rounded-full transition-all ${
          on
            ? "left-[11px] bg-[color:var(--color-carrot)]"
            : "left-[2px] bg-[color:var(--color-ink-3)]"
        }`}
      />
    </button>
  );
}

/** Removable key chip. */
export function KeyChip({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[7px] border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface-2)] py-1 pl-2 pr-1.5 font-mono text-[11.5px] text-[color:var(--color-ink)]">
      {name}
      <button
        type="button"
        aria-label={`Remove key ${name}`}
        title={`Remove key ${name}`}
        onClick={onRemove}
        className="grid h-4 w-4 place-items-center rounded text-[color:var(--color-ink-3)] hover:bg-white/5 hover:text-[color:var(--color-ink)]"
      >
        <XIcon />
      </button>
    </span>
  );
}

/** Dashed add-chip with a dropdown of candidates. */
export function AddChip({
  label,
  options,
  onPick,
  emptyNote,
}: {
  label: string;
  options: { name: string; note?: string }[];
  onPick: (name: string) => void;
  emptyNote: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-[7px] border border-dashed border-[color:var(--color-rule)] px-2.5 py-1 text-[11.5px] text-[color:var(--color-ink-3)] hover:border-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink-2)]"
      >
        <PlusIcon />
        {label}
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-10 min-w-[150px] rounded-[9px] border border-[color:var(--color-rule-soft)] bg-[color:var(--color-surface-2)] p-1 shadow-xl">
          {options.length === 0 ? (
            <div className="px-2 py-1.5 text-[11.5px] text-[color:var(--color-ink-3)]">
              {emptyNote}
            </div>
          ) : (
            options.map((o) => (
              <button
                key={o.name}
                type="button"
                onClick={() => {
                  onPick(o.name);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left font-mono text-[11.5px] text-[color:var(--color-ink)] hover:bg-white/5"
              >
                {o.name}
                {o.note && (
                  <span className="font-sans text-[color:var(--color-ink-3)]">{o.note}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
