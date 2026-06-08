"use client";

import { useState, type KeyboardEvent } from "react";
import Modal from "./Modal";
import { CloseButton } from "./CloseButton";

export interface ExpandableTextFieldProps {
  /** Current text value (controlled). */
  value: string;
  /** Live text updates, from both the inline input and the modal textarea. */
  onChange: (value: string) => void;
  /** Inline `<input>` blur handler (e.g. parse-and-commit an expression). */
  onBlur?: () => void;
  /** Key handler for the inline input (e.g. Enter-to-run for SQL). */
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  ariaLabel?: string;
  placeholder?: string;
  /** Tailwind classes for the inline `<input>`. */
  inputClassName?: string;
  /** Heading shown at the top of the expanded modal. */
  modalTitle?: string;
  /** Label for the modal's primary action button. Defaults to "Done". */
  modalActionLabel?: string;
  /** Runs on modal-confirm before closing. Defaults to `onBlur`. */
  onModalAction?: () => void;
  /** Optional error text surfaced inside the modal. */
  error?: string | null;
  spellCheck?: boolean;
  /** Disables the inline input and expand control. */
  disabled?: boolean;
}

/** Maximize / expand glyph (arrows to corners), as an inline SVG. */
function ExpandIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

/**
 * A single-line input with an "expand" control that opens a fixed-height
 * modal textarea for editing long content (formulas, SQL). The inline input
 * never auto-grows; both views share `value`/`onChange`, and the modal's
 * primary button commits via `onModalAction` (default `onBlur`).
 */
export function ExpandableTextField({
  value,
  onChange,
  onBlur,
  onKeyDown,
  ariaLabel,
  placeholder,
  inputClassName = "",
  modalTitle = "Edit",
  modalActionLabel = "Done",
  onModalAction,
  error,
  spellCheck,
  disabled,
}: ExpandableTextFieldProps) {
  const [open, setOpen] = useState(false);

  const commitModal = () => {
    (onModalAction ?? onBlur)?.();
    setOpen(false);
  };

  return (
    <div className="relative flex items-center">
      <input
        aria-label={ariaLabel}
        className={`${inputClassName} pr-7`}
        value={value}
        placeholder={placeholder}
        spellCheck={spellCheck}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        aria-label={`Expand${ariaLabel ? ` ${ariaLabel}` : ""}`}
        title="Expand editor"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="absolute right-1 inline-flex h-5 w-5 items-center justify-center rounded text-[color:var(--color-ink-3)] transition-colors hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-carrot)]/50 disabled:opacity-40"
      >
        <ExpandIcon />
      </button>

      <Modal
        open={open}
        onClose={commitModal}
        cardClassName="w-full max-w-2xl rounded-xl bg-white p-5 text-gray-900 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">{modalTitle}</h2>
          <CloseButton size="sm" label="Close editor" onClick={commitModal} />
        </div>
        <textarea
          aria-label={ariaLabel ? `${ariaLabel} (expanded)` : "expanded editor"}
          className={`mt-3 h-64 w-full resize-y rounded border px-3 py-2 font-mono text-sm text-gray-800 focus:outline-none ${
            error ? "border-red-400" : "border-gray-300 focus:border-gray-400"
          }`}
          value={value}
          placeholder={placeholder}
          spellCheck={spellCheck}
          autoFocus
          onChange={(e) => onChange(e.target.value)}
        />
        {error ? (
          <p className="mt-2 text-xs text-red-600">⚠ {error}</p>
        ) : null}
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={commitModal}
            className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
          >
            {modalActionLabel}
          </button>
        </div>
      </Modal>
    </div>
  );
}

export default ExpandableTextField;
