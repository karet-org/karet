"use client";

import { useState, type KeyboardEvent } from "react";

export interface ChipListEditorProps {
  /** Current list of values (controlled). */
  value: string[];
  /** Full replacement list on every add/remove. */
  onChange: (next: string[]) => void;
  ariaLabel?: string;
  /** Placeholder for the add-input. */
  placeholder?: string;
  /** Extra classes for the outer container. */
  className?: string;
}

/**
 * Edits a list of short strings as removable chips plus an add-input.
 * Enter or comma adds a chip (pasting commas adds several); Backspace on an
 * empty input removes the last; blanks and duplicates are dropped.
 */
export function ChipListEditor({
  value,
  onChange,
  ariaLabel,
  placeholder = "Add…",
  className = "",
}: ChipListEditorProps) {
  const [draft, setDraft] = useState("");

  const addTokens = (raw: string) => {
    const tokens = raw
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && !value.includes(t));
    if (tokens.length > 0) onChange([...value, ...tokens]);
  };

  const commitDraft = () => {
    if (draft.trim() !== "") {
      addTokens(draft);
      setDraft("");
    }
  };

  const removeAt = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitDraft();
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      e.preventDefault();
      removeAt(value.length - 1);
    }
  };

  return (
    <div
      className={`flex flex-wrap items-center gap-1 rounded border border-gray-300 bg-white px-1.5 py-1 ${className}`}
    >
      {value.map((chip, i) => (
        <span
          key={`${chip}-${i}`}
          className="inline-flex items-center gap-1 rounded bg-[color:var(--color-surface-2)] px-1.5 py-0.5 font-mono text-[11px] text-[color:var(--color-ink-2)]"
        >
          {chip}
          <button
            type="button"
            aria-label={`remove ${chip}`}
            onClick={() => removeAt(i)}
            className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[color:var(--color-ink-3)] transition-colors hover:bg-[color:var(--color-rule)] hover:text-[color:var(--color-ink)]"
          >
            <svg
              width={9}
              height={9}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              aria-hidden="true"
              focusable="false"
            >
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </span>
      ))}
      <input
        aria-label={ariaLabel}
        className="min-w-[80px] flex-1 bg-transparent px-1 py-0.5 font-mono text-[11px] text-gray-800 focus:outline-none"
        value={draft}
        placeholder={value.length === 0 ? placeholder : ""}
        onChange={(e) => {
          // Typing a comma commits the token rather than entering it raw.
          if (e.target.value.includes(",")) {
            addTokens(e.target.value);
            setDraft("");
          } else {
            setDraft(e.target.value);
          }
        }}
        onKeyDown={onKeyDown}
        onBlur={commitDraft}
      />
    </div>
  );
}

export default ChipListEditor;
