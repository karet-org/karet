"use client";

// Form controls for page-level forms.
//
// Native selects and radios render with OS chrome, which looks wrong in a dark
// custom theme and, for selects, crams the platform chevron against the text.
// These replace the chrome: `appearance-none` plus a chevron drawn in the right
// padding, and a radio built from a bordered circle.
//
// Sizes and radii follow what the app already uses: 34px controls, 6px radius,
// and the carrot focus ring from the login and inspector inputs.

import type { ReactNode, SelectHTMLAttributes } from "react";

const CONTROL =
  "h-[34px] rounded-md border border-[color:var(--color-rule)] bg-[color:var(--color-surface)] " +
  "text-[12.5px] text-[color:var(--color-ink)] outline-none transition " +
  "focus-visible:border-[color:var(--color-carrot)] focus-visible:ring-2 " +
  "focus-visible:ring-[color:var(--color-carrot-soft)] disabled:opacity-50";

/** A select with the platform chevron replaced, so the arrow has room to breathe. */
export function Select({
  label,
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <span className="relative inline-flex">
      <select
        aria-label={label}
        // pr-8 is the chevron's room; without it the arrow sits on the text.
        className={`${CONTROL} appearance-none pl-2.5 pr-8 ${className}`}
        {...props}
      >
        {children}
      </select>
      <svg
        width="12"
        height="12"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[color:var(--color-ink-3)]"
      >
        <path d="M4 6.5 8 10.5l4-4" />
      </svg>
    </span>
  );
}

/** A radio with its own dot, and its description tied to it for screen readers. */
export function Radio({
  name,
  value,
  checked,
  disabled,
  onChange,
  label,
  detail,
}: {
  name: string;
  value: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: ReactNode;
  detail?: ReactNode;
}) {
  const describedBy = detail ? `${name}-${value}-detail` : undefined;
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        aria-describedby={describedBy}
        data-testid={`visibility-${value}`}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={
          "mt-[0.15rem] grid h-[15px] w-[15px] shrink-0 place-items-center rounded-full border transition " +
          "peer-focus-visible:ring-2 peer-focus-visible:ring-[color:var(--color-carrot-soft)] " +
          (checked
            ? "border-[color:var(--color-carrot)]"
            : "border-[color:var(--color-rule)]")
        }
      >
        {checked && (
          <span className="h-[7px] w-[7px] rounded-full bg-[color:var(--color-carrot)]" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] text-[color:var(--color-ink)]">{label}</span>
        {detail && (
          <span id={describedBy} className="block text-[12px] text-[color:var(--color-ink-3)]">
            {detail}
          </span>
        )}
      </span>
    </label>
  );
}

/** Filled action. Same height as the controls beside it. */
export function primaryButtonClass(extra = ""): string {
  return (
    "inline-flex h-[34px] items-center rounded-md bg-[color:var(--color-carrot)] px-3 " +
    "text-[12.5px] font-medium text-white outline-none transition " +
    "hover:bg-[color:var(--color-carrot-deep)] " +
    "focus-visible:ring-2 focus-visible:ring-[color:var(--color-carrot-soft)] " +
    // A disabled primary should recede rather than sit there looking broken.
    "disabled:bg-[color:var(--color-surface-2)] disabled:text-[color:var(--color-ink-4)] " +
    `disabled:hover:bg-[color:var(--color-surface-2)] ${extra}`
  );
}

/** Low-emphasis action for table rows. */
export function ghostButtonClass(extra = ""): string {
  return (
    "rounded px-2 py-1 text-xs font-medium text-[color:var(--color-ink-3)] outline-none transition " +
    "hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-ink-2)] " +
    "focus-visible:ring-2 focus-visible:ring-[color:var(--color-carrot-soft)] " +
    `disabled:opacity-50 ${extra}`
  );
}

/** Page-level content frame, matching the radius the Data page uses. */
export const CARD =
  "rounded-[13px] border border-[color:var(--color-rule)] bg-[color:var(--color-surface)] p-5";
