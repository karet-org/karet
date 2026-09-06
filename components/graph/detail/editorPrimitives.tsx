// Shared small primitives used across the structural editors.
//
// Kept separate from the read-only `primitives.tsx` to avoid mixing
// view-mode and edit-mode visual vocabularies.

import type { ReactNode } from "react";

export interface InlineErrorListProps {
  errors: string[];
  /** Stable `data-testid` so property tests can assert visibility. */
  testId: string;
}

/**
 * Renders a list of inline validation errors. Returns `null` when
 * `errors.length === 0` so the caller can wire the presence of the
 * element to the "invalid" predicate.
 */
export function InlineErrorList({ errors, testId }: InlineErrorListProps) {
  if (errors.length === 0) return null;
  return (
    <ul
      data-testid={testId}
      role="alert"
      className="rounded border border-[color:var(--color-rose-deep)] bg-[color:var(--color-rose-soft)] px-2 py-1 text-[11px] text-[color:var(--color-rose-deep)]"
    >
      {errors.map((e, i) => (
        <li key={i}>{e}</li>
      ))}
    </ul>
  );
}

export interface EditorFieldProps {
  label: string;
  children: ReactNode;
  className?: string;
}

/** Label/control pair laid out the same way for every editor field. */
export function EditorField({ label, children, className }: EditorFieldProps) {
  return (
    <label className={`flex flex-col gap-1 text-xs ${className ?? ""}`}>
      <span className="text-[color:var(--color-ink-3)]">{label}</span>
      {children}
    </label>
  );
}

/** Thin wrapper that gives text/number inputs a uniform look. */
export function inputClass(extra = ""): string {
  return `rounded border border-[color:var(--color-rule)] bg-[color:var(--color-surface)] px-2 py-1 text-xs text-[color:var(--color-ink)] focus:border-gray-400 focus:outline-none ${extra}`;
}
